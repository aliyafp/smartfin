/**
 * SMARTFIN financial calculation engine. Pure functions over integer paise.
 *
 * Rules:
 *  - Income  = sum of `income` transactions.
 *  - Expenses = sum of `expense` transactions minus sum of `refund` transactions
 *    (a refund reverses spending; it is never counted as income).
 *  - Transfers move money between the user's own sources and are excluded from
 *    income, expenses and category spending.
 *  - Net cash flow = Income − Expenses.
 *  - Only confirmed records count (see `isCountable`); pending/failed scans never
 *    become transactions, and any unconfirmed row is ignored by every total.
 *  - Recorded balance of a source = opening balance + income + refunds − expenses
 *    − transfers out + transfers in. It reflects recorded entries only.
 */
import type { CalcSource, CalcTxn } from "./types";

const CONFIRMED = new Set(["confirmed", "user_confirmed"]);
/** True when a record counts towards confirmed totals. */
export const isCountable = (t: { confirmation_status?: string | null }) => t.confirmation_status == null || CONFIRMED.has(t.confirmation_status);

export interface Summary {
  incomePaise: number;
  expensePaise: number;
  grossExpensePaise: number;
  refundPaise: number;
  netPaise: number;
  transferPaise: number;
  count: number;
}

export function summarize(txns: CalcTxn[]): Summary {
  let income = 0, gross = 0, refund = 0, transfer = 0, count = 0;
  for (const t of txns) {
    if (!isCountable(t)) continue;
    count++;
    switch (t.txn_type) {
      case "income": income += t.amount_paise; break;
      case "expense": gross += t.amount_paise; break;
      case "refund": refund += t.amount_paise; break;
      case "transfer": transfer += t.amount_paise; break;
    }
  }
  const expense = gross - refund;
  return { incomePaise: income, expensePaise: expense, grossExpensePaise: gross, refundPaise: refund, netPaise: income - expense, transferPaise: transfer, count };
}

export interface CategorySlice {
  category: string;
  amountPaise: number;
  /** share of eligible spending in basis points (10000 = 100%) */
  shareBp: number;
}

/** Net spending per category (expenses minus refunds). Categories netting ≤ 0 are omitted. */
export function categoryBreakdown(txns: CalcTxn[]): CategorySlice[] {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (!isCountable(t) || (t.txn_type !== "expense" && t.txn_type !== "refund")) continue;
    const key = t.category ?? "uncategorised";
    const delta = t.txn_type === "expense" ? t.amount_paise : -t.amount_paise;
    map.set(key, (map.get(key) ?? 0) + delta);
  }
  const positive = [...map.entries()].filter(([, v]) => v > 0);
  const total = positive.reduce((s, [, v]) => s + v, 0);
  return positive
    .map(([category, amountPaise]) => ({ category, amountPaise, shareBp: total ? Math.round((amountPaise * 10000) / total) : 0 }))
    .sort((a, b) => b.amountPaise - a.amountPaise);
}

export function sourceBalances(sources: CalcSource[], txns: CalcTxn[]): Map<string, number> {
  const bal = new Map(sources.map((s) => [s.id, s.opening_balance_paise]));
  const add = (id: string | null, d: number) => {
    if (id && bal.has(id)) bal.set(id, (bal.get(id) ?? 0) + d);
  };
  for (const t of txns) {
    if (!isCountable(t)) continue;
    switch (t.txn_type) {
      case "income":
      case "refund": add(t.source_id, t.amount_paise); break;
      case "expense": add(t.source_id, -t.amount_paise); break;
      case "transfer": add(t.source_id, -t.amount_paise); add(t.to_source_id, t.amount_paise); break;
    }
  }
  return bal;
}

export interface TrendPoint { key: string; label: string; incomePaise: number; expensePaise: number }

/** Bucket income/expense by day (≤ 31 days range) or by month otherwise. */
export function trend(txns: CalcTxn[], range: DateRange): TrendPoint[] {
  const days = Math.round((range.end.getTime() - range.start.getTime()) / 86400000);
  const byMonth = days > 62;
  const points = new Map<string, TrendPoint>();
  const cursor = new Date(range.start);
  while (cursor < range.end) {
    const key = bucketKey(cursor, byMonth);
    if (!points.has(key)) {
      points.set(key, {
        key,
        label: byMonth
          ? cursor.toLocaleDateString("en-IN", { month: "short" })
          : cursor.toLocaleDateString("en-IN", { day: "numeric", month: days > 7 ? "short" : undefined, weekday: days <= 7 ? "short" : undefined }),
        incomePaise: 0,
        expensePaise: 0,
      });
    }
    if (byMonth) cursor.setMonth(cursor.getMonth() + 1, 1); else cursor.setDate(cursor.getDate() + 1);
  }
  for (const t of txns) {
    const p = isCountable(t) ? points.get(bucketKey(new Date(t.occurred_at), byMonth)) : undefined;
    if (!p) continue;
    if (t.txn_type === "income") p.incomePaise += t.amount_paise;
    else if (t.txn_type === "expense") p.expensePaise += t.amount_paise;
    else if (t.txn_type === "refund") p.expensePaise -= t.amount_paise;
  }
  return [...points.values()];
}

function bucketKey(d: Date, byMonth: boolean) {
  return byMonth ? `${d.getFullYear()}-${d.getMonth()}` : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ---------- Periods ----------
export type PeriodKey = "today" | "week" | "month" | "prev_month" | "custom";
export interface DateRange { start: Date; end: Date } // [start, end)

export function periodRange(key: PeriodKey, now = new Date(), custom?: { from: string; to: string }): DateRange {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  switch (key) {
    case "today": return { start: today, end: addDays(today, 1) };
    case "week": {
      const dow = (today.getDay() + 6) % 7; // Monday = 0
      const start = addDays(today, -dow);
      return { start, end: addDays(start, 7) };
    }
    case "month": return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    case "prev_month": return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) };
    case "custom": {
      if (!custom) return periodRange("month", now);
      const [fy = 1970, fm = 1, fd = 1] = custom.from.split("-").map(Number);
      const [ty = 1970, tm = 1, td = 1] = custom.to.split("-").map(Number);
      const start = new Date(fy, fm - 1, fd);
      const end = addDays(new Date(ty, tm - 1, td), 1);
      return end > start ? { start, end } : { start: end, end: addDays(start, 1) };
    }
  }
}

export function previousRange(r: DateRange, key: PeriodKey): DateRange {
  if (key === "month" || key === "prev_month") {
    return { start: new Date(r.start.getFullYear(), r.start.getMonth() - 1, 1), end: new Date(r.start) };
  }
  const len = r.end.getTime() - r.start.getTime();
  return { start: new Date(r.start.getTime() - len), end: new Date(r.start) };
}

export function inRange<T extends { occurred_at: string }>(txns: T[], r: DateRange): T[] {
  const s = r.start.getTime(), e = r.end.getTime();
  return txns.filter((t) => { const x = new Date(t.occurred_at).getTime(); return x >= s && x < e; });
}

function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
