/** Merchant name normalisation for connected sources. The original text is always kept separately. */
import { extractMerchant } from "@/lib/import/statement";
import { normaliseMerchant } from "@/lib/extract/normalise";

const NOISE = /\b(online|payments?|services|technologies|retail|marketplace|e-?commerce|upi|merchant)\b/gi;

/** "ZOMATO ONLINE", "Zomato Ltd", "Paid to Zomato" → "Zomato". Unknown names are tidied, never invented. */
export function canonicalMerchant(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .replace(/\s+using\s+.+$/i, "")
    .replace(/^(paid|sent|money\s+sent|payment|received|refund|transfer)\s+(to|from)\s+/i, "")
    .replace(/[\w.-]+@[\w.-]+/g, " ")
    .trim();
  if (!s) return null;
  const known = extractMerchant(s);
  if (known) return known;
  const stripped = s.replace(NOISE, " ").replace(/\s+/g, " ").trim();
  return normaliseMerchant(stripped || s);
}

/** Comparison key: lowercase letters and digits only. */
export const merchantKey = (name: string | null | undefined) => (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** True when two merchant names clearly refer to the same business. */
export function sameMerchant(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = merchantKey(canonicalMerchant(a)), y = merchantKey(canonicalMerchant(b));
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && long.includes(short);
}
