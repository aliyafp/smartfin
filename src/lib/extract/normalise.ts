/** Turns the raw AI reading into typed values. Pure; never invents values that weren't read. */
import { extractMerchant } from "@/lib/import/statement";
import type { Confidence, Field, NormItem, NormalisedExtraction, RawExtraction, RawField } from "./types";

// ---------- Sensitive data ----------
const SENSITIVE_LABEL = /\b(otp|one[\s-]?time[\s-]?password|upi\s*pin|m?pin|cvv|cvc|security\s*code|password|passcode)\b/i;

/** Removes OTPs, PINs, CVVs, passwords and full card numbers from a piece of text. */
export function scrubText(input: string | null): string | null {
  if (input == null) return null;
  let s = input;
  // "OTP 123456", "UPI PIN: 1234", "CVV-123"
  s = s.replace(/\b(otp|one[\s-]?time[\s-]?password|upi\s*pin|m?pin|cvv|cvc|security\s*code|password|passcode)\b\s*(is|:|-|=)?\s*[A-Za-z0-9]{3,8}\b/gi, "$1 [removed]");
  // Full card numbers (13–19 digits, optional spaces/dashes) -> keep last 4
  s = s.replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 ? `XXXX${digits.slice(-4)}` : m;
  });
  return s;
}

function scrubField(f: RawField): RawField {
  if (f.value && SENSITIVE_LABEL.test(f.value) && /\d{3,}/.test(f.value)) return { value: scrubText(f.value), confidence: f.confidence };
  return { value: scrubText(f.value), confidence: f.confidence };
}

const FIELD_KEYS = ["merchant_name", "counterparty_name", "payer_name", "amount", "currency", "date", "time", "reference_number", "receipt_number", "payment_method", "payment_app", "bank_name", "upi_id", "description", "merchant_address"] as const;
const AMOUNT_KEYS = ["subtotal", "discount", "gst_rate", "gst_amount", "cgst", "sgst", "igst", "other_taxes", "other_charges", "delivery_fee", "packaging_fee", "round_off", "total", "amount_paid"] as const;
const asField = (v: unknown): RawField => {
  const o = (v && typeof v === "object" ? v : {}) as { value?: unknown; confidence?: unknown };
  const c = o.confidence === "high" || o.confidence === "medium" || o.confidence === "low" ? o.confidence : "medium";
  return { value: typeof o.value === "string" ? o.value : null, confidence: c };
};

/** Fills any missing keys (older saved readings, partial responses) so later steps never crash. */
export function withDefaults(input: RawExtraction): RawExtraction {
  const r = (input ?? {}) as Partial<RawExtraction>;
  const f = (r.fields ?? {}) as Record<string, unknown>;
  const a = (r.amounts ?? {}) as Record<string, unknown>;
  return {
    document_type: r.document_type ?? "unknown_financial",
    classification_confidence: r.classification_confidence ?? "low",
    language: r.language ?? null,
    image_quality: r.image_quality ?? "good",
    readable_text_found: r.readable_text_found ?? true,
    status_text: r.status_text ?? null,
    status: r.status ?? "unknown",
    direction: r.direction ?? "unknown",
    counterparty_is_own_account: r.counterparty_is_own_account ?? null,
    payment_state_on_document: r.payment_state_on_document ?? "not_stated",
    fields: Object.fromEntries(FIELD_KEYS.map((k) => [k, asField(f[k])])) as RawExtraction["fields"],
    amounts: Object.fromEntries(AMOUNT_KEYS.map((k) => [k, asField(a[k])])) as RawExtraction["amounts"],
    items: Array.isArray(r.items) ? r.items.filter((i) => i && typeof i.name === "string") : [],
    notes_for_review: r.notes_for_review ?? null,
  };
}

/** Applies scrubText to every string value the model returned. */
export function scrubExtraction(input: RawExtraction): RawExtraction {
  const raw = withDefaults(input);
  const fields = Object.fromEntries(Object.entries(raw.fields).map(([k, v]) => [k, scrubField(v)])) as RawExtraction["fields"];
  const amounts = Object.fromEntries(Object.entries(raw.amounts).map(([k, v]) => [k, scrubField(v)])) as RawExtraction["amounts"];
  return {
    ...raw,
    status_text: scrubText(raw.status_text),
    notes_for_review: scrubText(raw.notes_for_review),
    fields,
    amounts,
    items: raw.items.map((i) => ({ ...i, name: scrubText(i.name) ?? "" })),
  };
}

// ---------- Amounts ----------
/**
 * Parses an amount as printed on Indian documents into integer paise.
 * Handles ₹ / Rs / INR, Indian digit grouping (1,23,456.50), "/-" suffix, minus signs and brackets.
 * Returns null when the text has no unambiguous amount.
 */
export function parseIndianAmount(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  s = s.replace(/\/-\s*$/, "").replace(/₹|rs\.?|inr|rupees?/gi, "").replace(/\s+/g, "");
  s = s.replace(/^\((.*)\)$/, "$1").replace(/^[-−–+]/, "").replace(/(cr|dr)$/i, "");
  if (!/^\d{1,3}(,\d{2,3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole = "", frac = ""] = s.replace(/,/g, "").split(".");
  const paise = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(paise) ? paise : null;
}

/** Parses a percentage like "18%", "GST @ 5 %", "2.5" or a combined "CGST 2.5% + SGST 2.5%" (→ 5). */
export function parsePercent(input: string | null | undefined): number | null {
  if (!input) return null;
  const s = String(input);
  const parts = s.includes("+") || (/cgst/i.test(s) && /sgst/i.test(s)) ? [...s.matchAll(/(\d{1,2}(?:\.\d{1,2})?)\s*%/g)].map((m) => Number(m[1])) : [];
  if (parts.length > 1) { const sum = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100; return sum > 0 && sum <= 50 ? sum : null; }
  const m = s.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%?/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 50 ? n : null;
}

/** Parses a quantity like "2", "1.5 kg", "x3". */
export function parseQuantity(input: string | null | undefined): number | null {
  if (!input) return null;
  const m = String(input).match(/(\d+(?:\.\d+)?)/);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return n > 0 && n < 100000 ? Math.round(n * 1000) / 1000 : null;
}

// ---------- Dates & times ----------
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

function makeDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export interface ParsedDate { iso: string | null; ambiguous: boolean; alternative: string | null; invalid: boolean }

/**
 * Parses dates as printed in India. Numeric dates are read day-first (DD/MM/YYYY);
 * when both orders are valid and different (e.g. 04/05/2026) the result is flagged ambiguous
 * with the month-first alternative, so the user confirms instead of SMARTFIN silently guessing.
 */
export function parseDocumentDate(input: string | null | undefined): ParsedDate {
  const none: ParsedDate = { iso: null, ambiguous: false, alternative: null, invalid: false };
  if (!input || !input.trim()) return none;
  const s = input.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ");

  let m = s.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) { const iso = makeDate(+m[1]!, +m[2]!, +m[3]!); return { ...none, iso, invalid: !iso }; }

  m = s.match(/\b(\d{1,2})[-/. ]([a-z]{3,9})[-/. ']*(\d{2,4})\b/);
  if (m && MONTHS[m[2]!.slice(0, m[2]!.startsWith("sept") ? 4 : 3)]) {
    const iso = makeDate(+m[3]!, MONTHS[m[2]!.slice(0, m[2]!.startsWith("sept") ? 4 : 3)]!, +m[1]!);
    return { ...none, iso, invalid: !iso };
  }
  m = s.match(/\b([a-z]{3,9})[ .-]?(\d{1,2})[ ]+(\d{4})\b/);
  if (m && MONTHS[m[1]!.slice(0, 3)]) {
    const iso = makeDate(+m[3]!, MONTHS[m[1]!.slice(0, 3)]!, +m[2]!);
    return { ...none, iso, invalid: !iso };
  }
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const a = +m[1]!, b = +m[2]!, y = +m[3]!;
    const dayFirst = makeDate(y, b, a);
    const monthFirst = makeDate(y, a, b);
    if (dayFirst && monthFirst && a !== b) return { iso: dayFirst, ambiguous: true, alternative: monthFirst, invalid: false };
    if (dayFirst) return { ...none, iso: dayFirst };
    if (monthFirst) return { ...none, iso: monthFirst };
    return { ...none, invalid: true };
  }
  return { ...none, invalid: true };
}

/** Parses "7:45 PM", "19:45", "07:45:12 pm" into "HH:MM" (24h). */
export function parseDocumentTime(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.trim().toLowerCase().match(/\b(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (!m) return null;
  let h = +m[1]!; const min = +m[2]!; const ap = m[3]?.replace(/\./g, "");
  if (min > 59) return null;
  if (ap) { if (h < 1 || h > 12) return null; if (ap === "pm" && h !== 12) h += 12; if (ap === "am" && h === 12) h = 0; }
  if (h > 23) return null;
  return `${pad(h)}:${pad(min)}`;
}

// ---------- References ----------
const REF_LABEL = /^\s*(upi\s*(transaction\s*)?(ref(erence)?|txn|transaction)?\s*(no\.?|number|id)?|utr(\s*no\.?)?|rrn|txn\s*id|transaction\s*id|ref(erence)?\s*(no\.?|number|id)?|order\s*(no\.?|id)|invoice\s*(no\.?|number)|bill\s*(no\.?|number)|receipt\s*(no\.?|number))\s*[:#.-]?\s*/i;
/** Strips printed labels like "UPI Ref No:" or "UTR" so only the identifier is kept. */
export function cleanReference(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = s.replace(REF_LABEL, "").trim();
  return v || null;
}

// ---------- Names ----------
const COMPANY_SUFFIX = /\b(pvt\.?|private|ltd\.?|limited|llp|inc\.?|india|co\.?)\b\.?/gi;

/** Cleaned merchant name for grouping (original is always kept separately). */
export function normaliseMerchant(name: string | null): string | null {
  if (!name) return null;
  const known = extractMerchant(name);
  if (known) return known;
  const cleaned = name.replace(COMPANY_SUFFIX, " ").replace(/[^\p{L}\p{N}&' .-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.split(" ").map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(" ").slice(0, 80);
}

const PAYMENT_METHOD_RULES: [RegExp, string][] = [
  [/\bupi\b|gpay|google\s*pay|phonepe|paytm|bhim|amazon\s*pay|cred\b/i, "UPI"],
  [/\bcash\b/i, "Cash"],
  [/credit\s*card|\bcc\b/i, "Credit card"],
  [/debit\s*card|\bdc\b|rupay|maestro/i, "Debit card"],
  [/net\s*banking|netbanking|internet\s*banking/i, "Net banking"],
  [/\bimps\b/i, "IMPS"], [/\bneft\b/i, "NEFT"], [/\brtgs\b/i, "RTGS"],
  [/bank\s*transfer/i, "Bank transfer"],
];
/** Maps a printed payment method to SMARTFIN's payment-method list, or null when unclear. */
export function mapPaymentMethod(text: string | null): string | null {
  if (!text) return null;
  for (const [re, label] of PAYMENT_METHOD_RULES) if (re.test(text)) return label;
  return null;
}

// ---------- Assemble ----------
function conf(f: RawField, parsedOk: boolean): Confidence {
  if (!f.value || !parsedOk) return "not_detected";
  return f.confidence;
}
function text(f: RawField, max = 120): Field<string> {
  const v = f.value?.trim() ? f.value.trim().slice(0, max) : null;
  return { value: v, raw: f.value, confidence: conf(f, Boolean(v)) };
}
function money(f: RawField): Field<number> {
  const v = parseIndianAmount(f.value);
  return { value: v, raw: f.value, confidence: conf(f, v !== null) };
}

export function normaliseExtraction(input: RawExtraction, idFor: (i: number) => string = (i) => `item-${i + 1}`): NormalisedExtraction {
  const raw = scrubExtraction(input);
  const F = raw.fields, A = raw.amounts;
  const pd = parseDocumentDate(F.date.value);
  const time = parseDocumentTime(F.time.value) ?? parseDocumentTime(F.date.value);
  const gstRate = parsePercent(A.gst_rate.value);
  const method = mapPaymentMethod(F.payment_method.value) ?? mapPaymentMethod(F.payment_app.value);
  const merchant = text(F.merchant_name, 80);
  const counterparty = text(F.counterparty_name, 80);
  const items: NormItem[] = raw.items
    .filter((i) => i.name && i.name.trim())
    .slice(0, 300)
    .map((i, idx) => ({
      id: idFor(idx),
      originalName: i.name.trim().slice(0, 200),
      normalisedName: null,
      quantity: parseQuantity(i.quantity),
      unitPricePaise: parseIndianAmount(i.unit_price),
      lineTotalPaise: parseIndianAmount(i.line_total),
      confidence: i.confidence,
    }));

  return {
    documentType: raw.document_type,
    classificationConfidence: raw.classification_confidence,
    language: raw.language,
    imageQuality: raw.image_quality,
    readableText: raw.readable_text_found,
    statusText: raw.status_text?.trim() || null,
    status: raw.status,
    direction: raw.direction,
    ownAccount: raw.counterparty_is_own_account,
    paymentState: raw.payment_state_on_document,
    merchant,
    merchantNormalised: normaliseMerchant(merchant.value ?? counterparty.value),
    counterparty,
    payer: text(F.payer_name, 80),
    amount: money(F.amount),
    currency: text(F.currency, 8),
    date: { value: pd.iso, raw: F.date.value, confidence: conf(F.date, Boolean(pd.iso)) === "high" && pd.ambiguous ? "medium" : conf(F.date, Boolean(pd.iso)) },
    dateAmbiguous: pd.ambiguous,
    dateAlternative: pd.alternative,
    time: { value: time, raw: F.time.value, confidence: conf(F.time.value ? F.time : F.date, Boolean(time)) },
    reference: { ...text(F.reference_number, 64), value: cleanReference(F.reference_number.value)?.slice(0, 64) ?? null },
    receiptNumber: { ...text(F.receipt_number, 64), value: cleanReference(F.receipt_number.value)?.slice(0, 64) ?? null },
    paymentMethod: { value: method, raw: F.payment_method.value ?? F.payment_app.value, confidence: method ? (F.payment_method.value ? F.payment_method.confidence : F.payment_app.confidence) : "not_detected" },
    paymentApp: text(F.payment_app, 40),
    bankName: text(F.bank_name, 60),
    upiId: text(F.upi_id, 80),
    description: text(F.description, 120),
    merchantAddress: text(F.merchant_address, 200),
    subtotal: money(A.subtotal),
    discount: money(A.discount),
    gstRate: { value: gstRate, raw: A.gst_rate.value, confidence: conf(A.gst_rate, gstRate !== null) },
    gstAmount: gstTotal(A),
    otherTaxes: money(A.other_taxes),
    otherCharges: money(A.other_charges),
    deliveryFee: money(A.delivery_fee),
    packagingFee: money(A.packaging_fee),
    roundOff: { ...money(A.round_off), value: signedRoundOff(A.round_off.value) },
    total: money(A.total),
    amountPaid: money(A.amount_paid),
    items,
    notesForReview: raw.notes_for_review,
  };
}

/** Total GST: the printed total line, else the sum of printed CGST/SGST/IGST lines. */
function gstTotal(A: RawExtraction["amounts"]): Field<number> {
  const single = money(A.gst_amount);
  if (single.value !== null) return single;
  const parts = [A.cgst, A.sgst, A.igst].map(money).filter((p) => p.value !== null);
  if (!parts.length) return single;
  const order: Confidence[] = ["low", "medium", "high"];
  const confidence = parts.map((p) => p.confidence).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? "medium";
  return { value: parts.reduce((a, p) => a + (p.value ?? 0), 0), raw: parts.map((p) => p.raw).join(" + "), confidence };
}

/** Round-off can be negative ("-0.40"); keep its sign. */
function signedRoundOff(v: string | null): number | null {
  const p = parseIndianAmount(v);
  if (p === null) return null;
  return /^\s*[-−–(]/.test(v ?? "") ? -p : p;
}

/** The amount SMARTFIN records: the amount actually paid when shown, else the transaction amount, else the bill total. */
export function primaryAmount(n: Pick<NormalisedExtraction, "amountPaid" | "amount" | "total">): number | null {
  return n.amountPaid.value ?? n.amount.value ?? n.total.value;
}
