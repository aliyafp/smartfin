/**
 * Monthly comparison & spending intelligence. Pure functions built on the
 * central engine (summarize / categoryBreakdown), so every screen uses the
 * same rules: transfers excluded, refunds reduce spending (never income),
 * uncategorised spending stays in the totals.
 *
 * Months are calendar months in the device's local timezone: [1st 00:00, next 1st 00:00).
 */
import { getCategory } from "./categories";
import { inRange, isCountable, summarize, type DateRange, type Summary } from "./engine";
import { formatMoney } from "./money";
import type { CalcTxn } from "./types";
import { extractMerchant } from "@/lib/import/statement";

export interface MonthId { year: number; month: number } // month: 0-11
export type AnalysisTxn = CalcTxn & { description: string; merchant?: string | null; reference?: string | null; is_demo?: boolean };

export const monthRange = ({ year, month }: MonthId): DateRange => ({ start: new Date(year, month, 1), end: new Date(year, month + 1, 1) });
export const monthOf = (d: Date): MonthId => ({ year: d.getFullYear(), month: d.getMonth() });
export const shiftMonth = ({ year, month }: MonthId, by: number): MonthId => { const d = new Date(year, month + by, 1); return monthOf(d); };
export const monthKey = (m: MonthId) => `${m.year}-${String(m.month + 1).padStart(2, "0")}`;
export const parseMonthKey = (k: string): MonthId | null => {
  const m = k.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const month = +m[2]! - 1;
  return month >= 0 && month < 12 ? { year: +m[1]!, month } : null;
};
export const monthLabel = (m: MonthId, style: "long" | "short" = "long") =>
  new Date(m.year, m.month, 1).toLocaleDateString("en-IN", { month: style, year: "numeric" });
export const monthName = (m: MonthId) => new Date(m.year, m.month, 1).toLocaleDateString("en-IN", { month: "long" });

/**
 * Percentage change in basis points (1% = 100 bp):
 * ((current − previous) / previous) × 100. Returns null when previous is 0 (no baseline).
 */
export function changeBp(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) * 10000) / Math.abs(previous));
}
export const formatPct = (bp: number) => `${Math.abs(bp / 100).toFixed(Math.abs(bp) < 1000 ? 1 : 0)}%`;

/** Changes under 3% are described as "almost the same". */
export const FLAT_BP = 300;
export type Direction = "up" | "down" | "flat" | "new" | "none";
export function direction(current: number, previous: number): Direction {
  if (previous === 0 && current === 0) return "none";
  if (previous === 0) return "new";
  const bp = changeBp(current, previous)!;
  if (Math.abs(bp) < FLAT_BP) return "flat";
  return bp > 0 ? "up" : "down";
}

export interface Metric { current: number; previous: number; delta: number; changeBp: number | null; direction: Direction }
const metric = (current: number, previous: number): Metric => ({ current, previous, delta: current - previous, changeBp: changeBp(current, previous), direction: direction(current, previous) });

/** Net spending per category (expenses − refunds), including uncategorised. */
function spendByCategory(txns: CalcTxn[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (!isCountable(t) || (t.txn_type !== "expense" && t.txn_type !== "refund")) continue;
    const key = getCategory(t.category).key; // unknown/null -> "uncategorised"
    map.set(key, (map.get(key) ?? 0) + (t.txn_type === "expense" ? t.amount_paise : -t.amount_paise));
  }
  return map;
}

export interface CategoryChange extends Metric { category: string; label: string }

/** Display name used to group spending by merchant. Falls back to the description. */
export function merchantName(t: { description: string; merchant?: string | null }): string {
  return (t.merchant?.trim() || extractMerchant(t.description) || t.description.trim()).slice(0, 80);
}
const mKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "") || name.toLowerCase();

export interface MerchantStat { key: string; name: string; count: number; previousCount: number; spent: Metric; categories: string[] }

export function merchantStats(current: AnalysisTxn[], previous: AnalysisTxn[]): MerchantStat[] {
  const map = new Map<string, { name: string; count: number; previousCount: number; cur: number; prev: number; cats: Set<string> }>();
  const add = (t: AnalysisTxn, isCur: boolean) => {
    if (!isCountable(t) || (t.txn_type !== "expense" && t.txn_type !== "refund")) return;
    const name = merchantName(t);
    const k = mKey(name);
    const e = map.get(k) ?? { name, count: 0, previousCount: 0, cur: 0, prev: 0, cats: new Set<string>() };
    const v = t.txn_type === "expense" ? t.amount_paise : -t.amount_paise;
    if (isCur) { e.cur += v; if (t.txn_type === "expense") e.count++; } else { e.prev += v; if (t.txn_type === "expense") e.previousCount++; }
    e.cats.add(getCategory(t.category).key);
    map.set(k, e);
  };
  current.forEach((t) => add(t, true));
  previous.forEach((t) => add(t, false));
  return [...map.entries()]
    .map(([key, e]) => ({ key, name: e.name, count: e.count, previousCount: e.previousCount, spent: metric(e.cur, e.prev), categories: [...e.cats] }))
    .filter((m) => m.count > 0 || m.previousCount > 0)
    .sort((a, b) => b.count - a.count || b.spent.current - a.spent.current);
}

// ---------- Recurring payments ----------
export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";
export interface RecurringCandidate {
  key: string;
  name: string;
  category: string;
  occurrences: number;
  typicalPaise: number;
  amountVaries: boolean;
  /** only set when there are at least 3 payments with a consistent gap */
  frequency: Frequency | null;
  lastPaidAt: string;
  confidence: "possible" | "likely";
}

const DAY = 86400000;
const FREQ_WINDOWS: [Frequency, number, number][] = [["weekly", 6, 8], ["monthly", 26, 35], ["quarterly", 84, 97], ["yearly", 355, 375]];
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2); };

/**
 * Detect possible recurring expenses from the whole history. These are estimates:
 *  - needs ≥ 2 payments to the same merchant with a regular gap and similar amounts (±20%)
 *  - "likely" with ≥ 3 payments; frequency is only reported then
 */
export function detectRecurring(txns: AnalysisTxn[]): RecurringCandidate[] {
  const groups = new Map<string, AnalysisTxn[]>();
  for (const t of txns) {
    if (t.txn_type !== "expense" || !isCountable(t)) continue;
    const k = mKey(merchantName(t));
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const out: RecurringCandidate[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => +new Date(a.occurred_at) - +new Date(b.occurred_at));
    const typical = median(sorted.map((t) => t.amount_paise));
    const similar = sorted.filter((t) => Math.abs(t.amount_paise - typical) <= typical * 0.2);
    if (similar.length < 2) continue;
    const gaps = similar.slice(1).map((t, i) => (+new Date(t.occurred_at) - +new Date(similar[i]!.occurred_at)) / DAY);
    const g = median(gaps);
    const win = FREQ_WINDOWS.find(([, lo, hi]) => g >= lo && g <= hi);
    if (!win) continue;
    const regular = gaps.filter((x) => x >= win[1] - 3 && x <= win[2] + 3).length >= Math.ceil(gaps.length * 0.6);
    if (!regular) continue;
    const last = similar[similar.length - 1]!;
    out.push({
      key, name: merchantName(last), category: getCategory(last.category).key, occurrences: similar.length, typicalPaise: typical,
      amountVaries: similar.some((t) => t.amount_paise !== typical),
      frequency: similar.length >= 3 ? win[0] : null,
      lastPaidAt: last.occurred_at,
      confidence: similar.length >= 3 ? "likely" : "possible",
    });
  }
  return out.sort((a, b) => b.typicalPaise - a.typicalPaise);
}

// ---------- Insights ----------
export interface MonthlyInsight { id: string; text: string }

function buildMonthlyInsights(cur: Summary, prev: Summary, cats: CategoryChange[], merchants: MerchantStat[], curM: MonthId, prevM: MonthId, uncategorised: { count: number; paise: number }, pace: Pace | null): MonthlyInsight[] {
  const out: MonthlyInsight[] = [];
  const pm = monthName(prevM);
  if (cur.count === 0 || prev.count === 0) return out;
  const soFar = pace ? " so far" : "";
  const first = (n: number) => (n === 1 ? "first day" : `first ${n} days`);

  const exp = metric(cur.expensePaise, prev.expensePaise);
  const pe = pace?.expenses;
  if (pace && pe && pe.direction !== "none") {
    const span = pace.previousDay === pace.day ? `the ${first(pace.day)} of ${pm}` : `all of ${pm}`;
    if (pe.direction === "flat") out.push({ id: "exp", text: `In the ${first(pace.day)} of ${monthName(curM)}, your spending is almost the same as in ${span}.` });
    else if (pe.direction === "new") out.push({ id: "exp", text: `You've spent ${formatMoney(pe.current, { decimals: "never" })} in the ${first(pace.day)} of ${monthName(curM)}; nothing was spent in ${span}.` });
    else out.push({ id: "exp", text: `In the ${first(pace.day)} of ${monthName(curM)}, you spent ${formatPct(pe.changeBp!)} ${pe.delta > 0 ? "more" : "less"} (${formatMoney(Math.abs(pe.delta), { decimals: "never" })}) than in ${span}.` });
  } else if (exp.direction === "flat") out.push({ id: "exp", text: `Your spending remained almost the same as in ${pm}.` });
  else if (exp.changeBp !== null && exp.direction !== "none") out.push({ id: "exp", text: `Expenses ${exp.delta > 0 ? "increased" : "decreased"} by ${formatPct(exp.changeBp)} (${formatMoney(Math.abs(exp.delta), { decimals: "never" })}) compared with ${pm}.` });

  const inc = metric(cur.incomePaise, prev.incomePaise);
  if (inc.changeBp !== null && inc.direction !== "flat" && inc.delta !== 0) out.push({ id: "inc", text: `Income ${inc.delta > 0 ? "increased" : "decreased"} by ${formatMoney(Math.abs(inc.delta), { decimals: "never" })} compared with ${pm}.` });
  else if (inc.direction === "flat" && cur.incomePaise > 0) out.push({ id: "inc", text: `Your income was about the same as in ${pm}.` });

  const meaningful = (c: CategoryChange) => c.changeBp !== null && Math.abs(c.changeBp) >= 1000 && Math.abs(c.delta) >= 20000; // ≥10% and ≥₹200
  const up = cats.filter((c) => c.delta > 0 && meaningful(c)).sort((a, b) => b.delta - a.delta)[0];
  if (up) {
    out.push({ id: "cat-up", text: `Your ${up.label} spending${soFar} increased by ${formatPct(up.changeBp!)} compared with ${pm}.` });
    const inCat = merchants.filter((m) => m.categories.includes(up.category) && m.spent.delta > 0).sort((a, b) => b.spent.delta - a.spent.delta).slice(0, 3);
    const share = inCat.reduce((s, m) => s + m.spent.delta, 0);
    if (inCat.length && share * 2 >= up.delta) {
      const names = inCat.map((m) => m.name);
      out.push({ id: "cat-up-m", text: `${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`} accounted for most of the increase in ${up.label}.` });
    }
  }
  const down = cats.filter((c) => c.delta < 0 && meaningful(c)).sort((a, b) => a.delta - b.delta)[0];
  if (down) out.push({ id: "cat-down", text: down.current === 0
    ? `No ${down.label} spending is recorded in ${monthName(curM)} yet (${formatMoney(down.previous, { decimals: "never" })} in ${pm}).`
    : `Your ${down.label} spending${soFar} is ${formatPct(down.changeBp!)} lower than in ${pm}.` });

  const subs = cats.find((c) => c.category === "subscriptions");
  if (subs && subs.direction === "flat" && subs.current > 0) out.push({ id: "subs", text: `Your subscription expenses remained almost unchanged.` });
  const transport = cats.find((c) => c.category === "transport");
  if (transport && transport !== up && transport !== down && transport.previous > 0 && (transport.direction === "up" || transport.direction === "down")) {
    out.push({ id: "transport", text: `Your transportation spending${soFar} ${transport.delta > 0 ? "increased" : "decreased"} compared with ${pm}.` });
  }

  const fresh = cats.filter((c) => c.direction === "new" && c.current >= 50000 && c.category !== "uncategorised").sort((a, b) => b.current - a.current)[0];
  if (fresh) out.push({ id: "new", text: `You spent ${formatMoney(fresh.current, { decimals: "never" })} on ${fresh.label} this month; there was no ${fresh.label} spending in ${pm}.` });

  if (uncategorised.count > 0 && cur.expensePaise > 0) out.push({ id: "uncat", text: `${formatMoney(uncategorised.paise, { decimals: "never" })} across ${uncategorised.count} transaction${uncategorised.count === 1 ? " is" : "s are"} uncategorised. Assigning categories will make these comparisons more precise.` });
  return out;
}

// ---------- Full report ----------
export interface MonthlyReport {
  current: MonthId;
  previous: MonthId;
  currentSummary: Summary;
  previousSummary: Summary;
  income: Metric;
  expenses: Metric;
  net: Metric;
  categories: CategoryChange[];
  biggestIncrease: CategoryChange | null;
  biggestDecrease: CategoryChange | null;
  merchants: MerchantStat[];
  uncategorised: { count: number; paise: number };
  insights: MonthlyInsight[];
  enoughHistory: boolean;
  /** Same-days comparison while the current month is still in progress. */
  pace: Pace | null;
  /** Records in either month that look like the same payment recorded twice. Still counted until the user removes one. */
  duplicates: DuplicateGroup[];
  /** Demo records included in the two months. */
  demoCount: number;
}

export function compareMonths(all: AnalysisTxn[], current: MonthId, previous: MonthId, now = new Date()): MonthlyReport {
  const txns = all.filter(isCountable);
  const curRows = inRange(txns, monthRange(current));
  const prevRows = inRange(txns, monthRange(previous));
  const cs = summarize(curRows), ps = summarize(prevRows);
  const cc = spendByCategory(curRows), pc = spendByCategory(prevRows);
  const categories: CategoryChange[] = [...new Set([...cc.keys(), ...pc.keys()])]
    .map((k) => ({ category: k, label: getCategory(k).label, ...metric(Math.max(0, cc.get(k) ?? 0), Math.max(0, pc.get(k) ?? 0)) }))
    .filter((c) => c.current > 0 || c.previous > 0)
    .sort((a, b) => b.current - a.current || b.previous - a.previous);
  const comparable = categories.filter((c) => c.previous > 0 && c.current > 0 && c.direction !== "flat");
  const biggestIncrease = comparable.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta)[0] ?? null;
  const biggestDecrease = comparable.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta)[0] ?? null;
  const merchants = merchantStats(curRows, prevRows);
  const uncRows = curRows.filter((t) => t.txn_type === "expense" && getCategory(t.category).key === "uncategorised");
  const uncategorised = { count: uncRows.length, paise: uncRows.reduce((s, t) => s + t.amount_paise, 0) };
  const pace = paceComparison(txns, current, previous, now);
  return {
    current, previous, currentSummary: cs, previousSummary: ps,
    income: metric(cs.incomePaise, ps.incomePaise),
    expenses: metric(cs.expensePaise, ps.expensePaise),
    net: metric(cs.netPaise, ps.netPaise),
    categories, biggestIncrease, biggestDecrease, merchants, uncategorised,
    insights: buildMonthlyInsights(cs, ps, categories, merchants, current, previous, uncategorised, pace),
    enoughHistory: cs.count > 0 && ps.count > 0,
    pace,
    duplicates: [...possibleDuplicates(curRows), ...possibleDuplicates(prevRows)],
    demoCount: [...curRows, ...prevRows].filter((t) => t.is_demo).length,
  };
}

// ---------- Month in progress ----------
export interface Pace {
  /** days of the current month covered (1..days) */
  day: number;
  days: number;
  /** matching day in the compared month, capped at its length (e.g. 28 for February) */
  previousDay: number;
  previousDays: number;
  expenses: Metric;
  income: Metric;
}

/**
 * While the current month is in progress, compare the first N days of it with the
 * first N days of the compared month, so a half-finished month isn't judged against
 * a full one. N is capped at the compared month's length (31 Mar vs 28 Feb → whole Feb).
 */
export function paceComparison(txns: AnalysisTxn[], current: MonthId, previous: MonthId, now = new Date()): Pace | null {
  const progress = monthProgress(current, now);
  if (!progress) return null;
  const previousDays = new Date(previous.year, previous.month + 1, 0).getDate();
  const previousDay = Math.min(progress.day, previousDays);
  const cs = summarize(inRange(txns, { start: new Date(current.year, current.month, 1), end: new Date(current.year, current.month, progress.day + 1) }));
  const ps = summarize(inRange(txns, { start: new Date(previous.year, previous.month, 1), end: new Date(previous.year, previous.month, previousDay + 1) }));
  return { day: progress.day, days: progress.days, previousDay, previousDays, expenses: metric(cs.expensePaise, ps.expensePaise), income: metric(cs.incomePaise, ps.incomePaise) };
}

// ---------- Possible duplicates ----------
export interface DuplicateGroup { key: string; name: string; txnType: string; amountPaise: number; occurredAt: string; ids: string[]; reason: "reference" | "same_day" }

const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const refKey = (r?: string | null) => (r ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Flags records that look like the same payment saved twice — same reference number,
 * or same type, amount, merchant and day. Never removes anything: the user decides.
 * Transfers are skipped (they don't affect income or spending).
 */
export function possibleDuplicates(rows: AnalysisTxn[]): DuplicateGroup[] {
  const groups = new Map<string, { reason: DuplicateGroup["reason"]; list: AnalysisTxn[] }>();
  const seen = new Set<string>();
  for (const t of rows) {
    if (t.txn_type === "transfer") continue;
    const ref = refKey(t.reference);
    if (ref.length >= 6) {
      const k = `r:${t.txn_type}:${t.amount_paise}:${ref}`;
      const g = groups.get(k) ?? { reason: "reference" as const, list: [] };
      g.list.push(t); groups.set(k, g);
    }
  }
  for (const g of groups.values()) if (g.list.length > 1) g.list.forEach((t) => seen.add(t.id));
  for (const t of rows) {
    if (t.txn_type === "transfer" || seen.has(t.id)) continue;
    const k = `d:${t.txn_type}:${t.amount_paise}:${dayKey(t.occurred_at)}:${mKey(merchantName(t))}`;
    const g = groups.get(k) ?? { reason: "same_day" as const, list: [] };
    g.list.push(t); groups.set(k, g);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.list.length > 1)
    .map(([key, g]) => ({ key, name: merchantName(g.list[0]!), txnType: g.list[0]!.txn_type, amountPaise: g.list[0]!.amount_paise, occurredAt: g.list[0]!.occurred_at, ids: g.list.map((t) => t.id), reason: g.reason }))
    .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));
}

/** Plain-language sentence for a metric, e.g. "Expenses increased by 12%." */
export function describeChange(label: string, m: Metric, opts: { amount?: boolean } = {}): string {
  switch (m.direction) {
    case "none": return `No ${label.toLowerCase()} recorded in either month.`;
    case "new": return `No previous-month ${label.toLowerCase()} to compare.`;
    case "flat": return `${label} remained almost the same.`;
    default: {
      const verb = m.delta > 0 ? "increased" : "decreased";
      return opts.amount ? `${label} ${verb} by ${formatMoney(Math.abs(m.delta), { decimals: "never" })}.` : `${label} ${verb} by ${formatPct(m.changeBp!)}.`;
    }
  }
}

/** Months that have any transactions, newest first, always including the current month. */
/** For the month in progress: days elapsed and total days, otherwise null. */
export function monthProgress(m: MonthId, now = new Date()): { day: number; days: number } | null {
  if (m.year !== now.getFullYear() || m.month !== now.getMonth()) return null;
  return { day: now.getDate(), days: new Date(m.year, m.month + 1, 0).getDate() };
}

export function availableMonths(txns: { occurred_at: string }[], now = new Date()): MonthId[] {
  const keys = new Set<string>([monthKey(monthOf(now))]);
  for (const t of txns) keys.add(monthKey(monthOf(new Date(t.occurred_at))));
  let earliest = monthOf(now);
  for (const k of keys) { const m = parseMonthKey(k)!; if (m.year * 12 + m.month < earliest.year * 12 + earliest.month) earliest = m; }
  const out: MonthId[] = [];
  for (let m = monthOf(now); m.year * 12 + m.month >= earliest.year * 12 + earliest.month; m = shiftMonth(m, -1)) out.push(m);
  return out;
}
