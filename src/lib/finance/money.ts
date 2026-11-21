/**
 * Money helpers. All amounts are stored and computed as integer paise
 * (1 INR = 100 paise). Never use floating point for financial arithmetic.
 */
export const DEFAULT_CURRENCY = "INR";
export const DEFAULT_LOCALE = "en-IN";

/** Parse user input like "1,250.75", "₹ 500", "1250" into integer paise. Returns null when invalid. */
export function parseAmountToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "").replace(/^INR/i, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const paise = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(paise)) return null;
  return paise;
}

/** Convert paise to a plain editable string, e.g. 125075 -> "1250.75", 50000 -> "500". */
export function paiseToInput(paise: number): string {
  const whole = Math.trunc(paise / 100);
  const frac = Math.abs(paise % 100);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0")}`;
}

export interface FormatOptions {
  /** "auto" hides .00 but shows paise when present; "always" forces 2 decimals; "never" rounds to rupees. */
  decimals?: "auto" | "always" | "never";
  signed?: boolean;
  currency?: string;
  locale?: string;
}

/** Format integer paise using Indian digit grouping: 10000000 paise -> ₹1,00,000. */
export function formatMoney(paise: number, opts: FormatOptions = {}): string {
  const { decimals = "auto", signed = false, currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE } = opts;
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const hasPaise = abs % 100 !== 0;
  const fractionDigits = decimals === "always" ? 2 : decimals === "never" ? 0 : hasPaise ? 2 : 0;
  const value = decimals === "never" ? Math.round(abs / 100) : abs / 100;
  const body = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
  const sign = negative ? "−" : signed && paise > 0 ? "+" : "";
  return sign + body;
}
