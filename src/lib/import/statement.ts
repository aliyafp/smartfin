/**
 * CSV statement processing: column detection, date/amount parsing, row
 * normalisation, merchant extraction, categorisation and duplicate detection.
 * Pure functions — no I/O. Nothing here ever drops a row silently: every
 * non-blank row ends up either valid or invalid with a reason.
 */
import { parseAmountToPaise } from "@/lib/finance/money";

export type Field = "date" | "time" | "description" | "merchant" | "debit" | "credit" | "amount" | "type" | "reference" | "account" | "balance";
export type Mapping = Partial<Record<Field, string>>;
export type DateOrder = "dmy" | "mdy" | "ymd";
export type ImportTxnType = "income" | "expense" | "refund";

export const FIELD_LABELS: Record<Field, string> = {
  date: "Transaction date",
  time: "Time",
  description: "Description / narration",
  merchant: "Merchant / payee",
  debit: "Debit (money out)",
  credit: "Credit (money in)",
  amount: "Amount",
  type: "Type (Dr/Cr)",
  reference: "Reference / transaction ID",
  account: "Account information",
  balance: "Balance",
};

const PATTERNS: Record<Field, RegExp[]> = {
  date: [/^(txn|transaction|value|posting|tran|trans)?\s*\.?\s*date(\s*&\s*time)?$/i, /date/i],
  time: [/^(txn\s*|transaction\s*)?time$/i],
  description: [/narration|description|particulars|remarks|transaction\s*details|^details$/i],
  merchant: [/merchant|payee|paid\s*to|beneficiary|counterparty|^name$|receiver|recipient/i],
  debit: [/^(debit|withdrawal|dr)\b(?!\s*\/)|withdrawal\s*amt|debit\s*amount|paid\s*out|money\s*out/i],
  credit: [/^(credit|deposit|cr)\b(?!\s*\/)|deposit\s*amt|credit\s*amount|paid\s*in|money\s*in/i],
  amount: [/^(txn\s*|transaction\s*)?amount(\s*\(?(inr|rs\.?|₹)\)?)?$/i, /^amt\.?$/i, /amount/i],
  type: [/^(type|dr\s*\/\s*cr|cr\s*\/\s*dr|debit\s*\/\s*credit|credit\s*\/\s*debit|txn\s*type|transaction\s*type|type\s*\(.*\))$/i],
  reference: [/ref|chq|cheque|utr|transaction\s*id|txn\s*id|order\s*id/i],
  account: [/account|a\/c|acct|card\s*(no|number)|upi\s*id|vpa/i],
  balance: [/balance/i],
};
const ORDER: Field[] = ["balance", "type", "reference", "account", "debit", "credit", "amount", "time", "date", "merchant", "description"];

export function detectColumns(headers: string[]): Mapping {
  const used = new Set<string>();
  const m: Mapping = {};
  for (const f of ORDER) {
    for (const re of PATTERNS[f]) {
      const h = headers.find((x) => !used.has(x) && re.test(x.trim()));
      if (h) { m[f] = h; used.add(h); break; }
    }
  }
  return m;
}

export function mappingProblems(m: Mapping): string[] {
  const p: string[] = [];
  if (!m.date) p.push("Choose the column that holds the transaction date.");
  if (!m.description && !m.merchant) p.push("Choose the column that holds the description, narration or merchant.");
  if (!m.amount && !(m.debit || m.credit)) p.push("Choose either an Amount column, or Debit and Credit columns.");
  const picked = Object.values(m).filter(Boolean);
  if (new Set(picked).size !== picked.length) p.push("Each column can only be used once.");
  return p;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** Parse a statement date. Returns a local Date (with time if present), or null. */
export function parseStatementDate(raw: string, order: DateOrder = "dmy", rawTime = ""): Date | null {
  const s = raw.trim();
  if (!s) return null;
  let y: number, mo: number, d: number;
  let hh = 0, mm = 0;
  const time = `${s} ${rawTime}`.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
  if (time) {
    hh = Number(time[1]); mm = Number(time[2]);
    const ap = time[3]?.toLowerCase();
    if (ap === "pm" && hh < 12) hh += 12;
    if (ap === "am" && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) { hh = 0; mm = 0; }
  }
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const named = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3,9})[\s\-/,]+(\d{2,4})/);
  const namedFirst = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  const num = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  const monthOf = (name: string) => MONTHS[name.toLowerCase().slice(0, name.toLowerCase().startsWith("sept") ? 4 : 3)];
  if (iso) { y = +iso[1]!; mo = +iso[2]!; d = +iso[3]!; }
  else if (named) {
    const m = monthOf(named[2]!);
    if (!m) return null;
    d = +named[1]!; mo = m; y = +named[3]!;
  } else if (namedFirst) {
    const m = monthOf(namedFirst[1]!);
    if (!m) return null;
    mo = m; d = +namedFirst[2]!; y = +namedFirst[3]!;
  } else if (num) {
    const a = +num[1]!, b = +num[2]!; y = +num[3]!;
    if (order === "mdy") { mo = a; d = b; } else { d = a; mo = b; }
  } else return null;
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(y, mo - 1, d, hh, mm);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null; // e.g. 31/02
  return dt;
}

/** Guess whether numeric dates are day-first or month-first. Indian statements default to day-first. */
export function guessDateOrder(values: string[]): DateOrder {
  let dayFirst = 0, monthFirst = 0;
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) continue;
    if (+m[1]! > 12) dayFirst++;
    if (+m[2]! > 12) monthFirst++;
  }
  return monthFirst > dayFirst ? "mdy" : "dmy";
}

/** Parse a statement amount: "1,23,456.78", "₹500", "(500.00)", "-500", "500 Dr", "500.00 CR". */
export function parseStatementAmount(raw: string): { paise: number; sign: 1 | -1 | 0 } | null {
  let s = raw.trim().replace(/\s+/g, " ");
  if (!s || s === "-" || s === "--") return null;
  let sign: 1 | -1 | 0 = 0;
  if (/\s*\bdr\.?$/i.test(s)) { sign = -1; s = s.replace(/\s*\bdr\.?$/i, ""); }
  else if (/\s*\bcr\.?$/i.test(s)) { sign = 1; s = s.replace(/\s*\bcr\.?$/i, ""); }
  s = s.trim();
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1).trim(); }
  if (s.startsWith("-")) { sign = -1; s = s.slice(1); }
  else if (s.startsWith("+")) { sign = 1; s = s.slice(1); }
  s = s.replace(/^(inr|rs\.?)\s*/i, "").trim();
  if (s.startsWith("-")) { sign = -1; s = s.slice(1); }
  const paise = parseAmountToPaise(s);
  if (paise === null) return null;
  return { paise, sign };
}

const EXPENSE_WORDS = new Set(["dr", "d", "debit", "debited", "withdrawal", "withdraw", "expense", "paid", "sent", "payment", "out", "purchase"]);
const INCOME_WORDS = new Set(["cr", "c", "credit", "credited", "deposit", "income", "received", "in", "refund", "receive"]);

const REFUND_RE = /\b(refund|refunded|reversal|reversed|chargeback|rev)\b/i;
const TRANSFER_RE = /\b(self\s*transfer|own\s*account|to\s*self|from\s*self|self\s*a\/?c|sweep|transfer\s*to\s*(savings|fd)|credit\s*card\s*(bill\s*)?payment|cc\s*payment)\b/i;

export interface ParsedRow {
  row: number; // 1-based data row
  date: Date;
  description: string;
  merchant: string | null;
  amountPaise: number;
  type: ImportTxnType;
  reference: string | null;
  account: string | null;
  /** looks like money moving between the user's own accounts */
  possibleTransfer: boolean;
}
export interface InvalidRow { row: number; reason: string; raw: Record<string, string> }

export function normaliseRows(rows: Record<string, string>[], m: Mapping, order: DateOrder = "dmy", shapeErrors?: Map<number, string>) {
  const valid: ParsedRow[] = [];
  const invalid: InvalidRow[] = [];
  let blank = 0;
  rows.forEach((raw, i) => {
    const row = i + 1;
    const get = (f: Field) => (m[f] ? String(raw[m[f]!] ?? "").trim() : "");
    if (Object.values(raw).every((v) => !String(v ?? "").trim())) { blank++; return undefined; } // empty line, not a record
    const fail = (reason: string) => { invalid.push({ row, reason, raw }); };
    const shape = shapeErrors?.get(row);
    if (shape) return fail(shape);

    const date = parseStatementDate(get("date"), order, get("time"));
    if (!date) return fail(get("date") ? `Date format not recognised: “${get("date")}”` : "Missing date");
    const merchantCol = get("merchant").replace(/\s+/g, " ").slice(0, 80);
    const description = (get("description") || merchantCol).replace(/\s+/g, " ").slice(0, 120);
    if (!description) return fail("Missing description");

    let amountPaise = 0;
    let type: "income" | "expense" | null = null;
    if (m.debit || m.credit) {
      const dr = get("debit") ? parseStatementAmount(get("debit")) : null;
      const cr = get("credit") ? parseStatementAmount(get("credit")) : null;
      if (get("debit") && !dr) return fail(`Debit amount can't be read: “${get("debit")}”`);
      if (get("credit") && !cr) return fail(`Credit amount can't be read: “${get("credit")}”`);
      const drP = dr?.paise ?? 0, crP = cr?.paise ?? 0;
      if (drP > 0 && crP > 0) return fail("Both debit and credit are filled in — only one should be");
      if (drP > 0) { amountPaise = drP; type = "expense"; }
      else if (crP > 0) { amountPaise = crP; type = "income"; }
      else if (!m.amount) return fail(get("debit") || get("credit") ? "Amount is zero" : "No debit or credit amount");
    }
    if (!type) {
      const a = parseStatementAmount(get("amount"));
      if (!a) return fail(get("amount") ? `Amount can't be read: “${get("amount")}”` : "Missing amount");
      if (a.paise === 0) return fail("Amount is zero");
      const t = get("type").toLowerCase().replace(/[^a-z]/g, "");
      const fromType = EXPENSE_WORDS.has(t) ? "expense" : INCOME_WORDS.has(t) ? "income" : null;
      if (m.type && t && !fromType) return fail(`Unknown transaction type “${get("type")}”`);
      if (fromType && a.sign !== 0 && (a.sign < 0) !== (fromType === "expense")) return fail(`Type says ${fromType === "expense" ? "debit" : "credit"} but the amount sign says the opposite`);
      type = fromType ?? (a.sign < 0 ? "expense" : a.sign > 0 ? "income" : null);
      if (!type) return fail("Can't tell if this is money in or out. Map a Type column or use Debit/Credit columns.");
      amountPaise = a.paise;
    }
    if (amountPaise >= 100000000000) return fail("Amount is too large");
    const finalType: ImportTxnType = type === "income" && REFUND_RE.test(description) ? "refund" : type;
    const merchant = merchantCol ? tidyName(merchantCol) : extractMerchant(description);
    valid.push({
      row, date, description, merchant, amountPaise, type: finalType,
      reference: get("reference").slice(0, 64) || null,
      account: get("account").slice(0, 40) || null,
      possibleTransfer: TRANSFER_RE.test(description),
    });
    return undefined;
  });
  return { valid, invalid, blank };
}

// ---------- Merchants ----------
const KNOWN_MERCHANTS: [RegExp, string][] = [
  [/swiggy/i, "Swiggy"], [/zomato/i, "Zomato"], [/uber\s*eats/i, "Uber Eats"], [/domino/i, "Domino's"], [/mcdonald/i, "McDonald's"], [/\bkfc\b/i, "KFC"], [/starbucks/i, "Starbucks"],
  [/amazon\s*prime|primevideo/i, "Amazon Prime"], [/amazon|amzn/i, "Amazon"], [/flipkart/i, "Flipkart"], [/myntra/i, "Myntra"], [/ajio/i, "AJIO"], [/nykaa/i, "Nykaa"], [/meesho/i, "Meesho"],
  [/bigbasket|bbnow/i, "BigBasket"], [/blinkit|grofers/i, "Blinkit"], [/zepto/i, "Zepto"], [/\bdmart\b|avenue\s*supermarts/i, "DMart"], [/instamart/i, "Swiggy Instamart"],
  [/\buber\b/i, "Uber"], [/\bola\b|olacabs|ani\s*technologies/i, "Ola"], [/rapido/i, "Rapido"], [/irctc/i, "IRCTC"], [/redbus/i, "redBus"], [/fastag/i, "FASTag"],
  [/netflix/i, "Netflix"], [/spotify/i, "Spotify"], [/hotstar|jiocinema/i, "JioHotstar"], [/youtube/i, "YouTube"], [/apple\.com|itunes/i, "Apple"], [/google\s*play/i, "Google Play"],
  [/bookmyshow/i, "BookMyShow"], [/\bpvr\b|inox/i, "PVR INOX"],
  [/airtel/i, "Airtel"], [/\bjio\b|reliance\s*jio/i, "Jio"], [/vodafone|\bvi\b/i, "Vi"], [/bsnl/i, "BSNL"], [/bescom/i, "BESCOM"], [/tneb|tangedco/i, "TANGEDCO"], [/msedcl|mahadiscom/i, "MSEDCL"], [/tata\s*power/i, "Tata Power"], [/adani\s*electricity/i, "Adani Electricity"],
  [/apollo/i, "Apollo"], [/medplus/i, "MedPlus"], [/\b1mg\b|tata\s*1mg/i, "Tata 1mg"], [/netmeds/i, "Netmeds"], [/pharmeasy/i, "PharmEasy"],
  [/urban\s*company|urbanclap/i, "Urban Company"], [/udemy/i, "Udemy"], [/coursera/i, "Coursera"], [/byju/i, "BYJU'S"],
];

const NOISE = /^(upi|dr|cr|p2m|p2a|imps|neft|rtgs|pos|ecom|ach|nach|mb|ib|inb|bil|onl|payment|pay|paid|txn|transfer|trf|to|from|by|ref|collect|request|na|null|vps|vin|yesb|hdfc|icic|sbin|utib|kkbk|pytm|axis|ybl|okaxis|oksbi|okhdfcbank|okicici|paytm)$/i;

function tidyName(s: string): string {
  const t = s.replace(/[_*]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!/[a-z]/.test(t) && /[A-Z]/.test(t)) return t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return t;
}

/** Best-effort merchant name from a narration. Returns null instead of guessing. */
export function extractMerchant(description: string): string | null {
  for (const [re, name] of KNOWN_MERCHANTS) if (re.test(description)) return name;
  const phrase = description.match(/^(?:paid\s+to|sent\s+to|money\s+sent\s+to|payment\s+to|received\s+from|transfer\s+to|transfer\s+from)\s+(.+)$/i);
  if (phrase?.[1]) return tidyName(phrase[1]);
  if (/^(upi|imps|neft|pos|ecom)\b/i.test(description)) {
    const parts = description.split(/[/\-|:]/).map((p) => p.trim()).filter(Boolean);
    const pick = parts.find((p) => /[a-z]{3,}/i.test(p) && !p.includes("@") && !NOISE.test(p) && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(p) && !/^\d+$/.test(p) && !/^x+\d+$/i.test(p));
    if (pick) return tidyName(pick);
  }
  return null;
}

// ---------- Duplicates ----------
export interface ExistingTxn { txn_type: string; amount_paise: number; occurred_at: string; source_id: string | null; reference: string | null; description: string; merchant?: string | null }
/**
 *  - exact: same reference number already saved, or same source/day/amount/type/description
 *  - likely: same source, day, amount and type, but a different description
 *  - other_source: same day, amount and type in another of your sources with the same merchant
 *    (e.g. a UPI payment that also appears in your bank statement)
 *  - in_file: repeats an earlier row in the same file
 */
export type DupKind = "exact" | "likely" | "other_source" | "in_file";
export const DUP_LABELS: Record<DupKind, string> = {
  exact: "Already saved — same reference or identical entry",
  likely: "Possible duplicate — same day and amount already saved",
  other_source: "Possible duplicate — same payment found in another source",
  in_file: "Repeated earlier in this file",
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Flag possible duplicates. Never deletes anything — the user decides. */
export function findDuplicates(rows: Pick<ParsedRow, "row" | "date" | "description" | "merchant" | "amountPaise" | "type" | "reference">[], existing: ExistingTxn[], sourceId: string): Map<number, DupKind> {
  const out = new Map<number, DupKind>();
  const refs = new Set(existing.filter((t) => t.reference && norm(t.reference).length >= 6).map((t) => norm(t.reference!)));
  const byKey = new Map<string, ExistingTxn[]>();
  for (const t of existing) {
    const k = `${dayKey(new Date(t.occurred_at))}|${t.amount_paise}|${t.txn_type}`;
    byKey.set(k, [...(byKey.get(k) ?? []), t]);
  }
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${dayKey(r.date)}|${r.amountPaise}|${r.type}`;
    const fileKey = `${k}|${norm(r.description)}|${r.reference ? norm(r.reference) : ""}`;
    const cands = byKey.get(k) ?? [];
    const same = cands.filter((c) => c.source_id === sourceId);
    const other = cands.filter((c) => c.source_id !== sourceId);
    const merchantOf = (c: ExistingTxn) => norm(c.merchant ?? extractMerchant(c.description) ?? c.description);
    const myMerchant = norm(r.merchant ?? r.description);
    if (r.reference && norm(r.reference).length >= 6 && refs.has(norm(r.reference))) out.set(r.row, "exact");
    else if (same.some((c) => norm(c.description) === norm(r.description))) out.set(r.row, "exact");
    else if (same.length) out.set(r.row, "likely");
    else if (other.some((c) => merchantOf(c) === myMerchant)) out.set(r.row, "other_source");
    else if (seen.has(fileKey)) out.set(r.row, "in_file");
    seen.add(fileKey);
  }
  return out;
}

// ---------- Categories ----------
/** Keyword rules. Order matters: more specific rules come first. */
const RULES: [RegExp, string][] = [
  [/netflix|spotify|amazon\s*prime|primevideo|hotstar|jiocinema|youtube\s*premium|subscription|apple\.com|itunes|google\s*play|\bzee5\b|sonyliv/i, "subscriptions"],
  [/swiggy(?!\s*instamart)|zomato|uber\s*eats|restaurant|\bcafe\b|domino|pizza|mcdonald|\bkfc\b|starbucks|burger|biryani|bakery|\bdhaba\b/i, "food"],
  [/bigbasket|bbnow|blinkit|zepto|grofers|instamart|\bdmart\b|grocery|groceries|reliance\s*fresh|more\s*retail|supermarket|kirana/i, "groceries"],
  [/amazon|amzn|flipkart|myntra|ajio|nykaa|meesho|croma|reliance\s*digital|decathlon|\bshopping\b/i, "shopping"],
  [/\buber\b|\bola\b|olacabs|rapido|irctc|\bmetro\b|\bfuel\b|petrol|diesel|indian\s*oil|\biocl\b|hpcl|bpcl|fastag|redbus|parking|\btoll\b/i, "transport"],
  [/\brent\b|landlord|house\s*rent|society\s*maintenance|\bmaintenance\s*charges\b/i, "housing"],
  [/electricity|electric\s*bill|bescom|tneb|tangedco|msedcl|tata\s*power|adani\s*electricity|water\s*bill|\bgas\s*bill\b|\blpg\b|indane|broadband|\bwifi\b|airtel|\bjio\b|vodafone|\bvi\b|bsnl|recharge|\bdth\b|tata\s*play|postpaid|prepaid/i, "utilities"],
  [/bookmyshow|\bpvr\b|inox|cinema|movie|\bgames?\b|steam|playstation/i, "entertainment"],
  [/pharma|pharmacy|apollo|medplus|hospital|clinic|\b1mg\b|netmeds|pharmeasy|doctor|diagnostic|\blab\b/i, "healthcare"],
  [/school|college|tuition|\bcourse\b|udemy|coursera|byju|\bfees?\b|university|exam/i, "education"],
  [/salon|\bspa\b|urban\s*company|urbanclap|parlour|barber/i, "personal_care"],
];

/**
 * Suggest a category from the description/merchant. Returns null (Uncategorised)
 * when nothing matches — we never invent a category.
 */
export function suggestCategory(text: string, type: ImportTxnType): string | null {
  if (type === "income") {
    if (/salary|payroll|\bsal\b/i.test(text)) return "salary";
    if (/interest|int\.?\s*pd|\bint\s*cr\b/i.test(text)) return "interest";
    return null;
  }
  for (const [re, c] of RULES) if (re.test(text)) return c;
  return null;
}
