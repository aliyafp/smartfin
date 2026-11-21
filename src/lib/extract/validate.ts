/** Mathematical and data checks on an extraction. Pure; never changes the extracted values. */
import { formatMoney } from "@/lib/finance/money";
import { CONFIDENCE_LABELS, type NormalisedExtraction } from "./types";

export type CheckLevel = "ok" | "info" | "warning" | "error";
export interface Check { id: string; level: CheckLevel; title: string; detail?: string }

/** Rounding tolerance: ₹1, or 1 paisa per line for long receipts, whichever is larger. */
export const TOLERANCE_PAISE = 100;

const fmt = (p: number) => formatMoney(p, { decimals: "always" });
const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

type V = Pick<NormalisedExtraction, "items" | "subtotal" | "discount" | "gstAmount" | "otherTaxes" | "gstRate" | "otherCharges" | "deliveryFee" | "packagingFee" | "roundOff" | "total" | "amountPaid" | "amount">;

export function checkAmounts(n: V, amountPaise: number | null): Check[] {
  const out: Check[] = [];
  if (amountPaise === null || amountPaise <= 0) out.push({ id: "amount_missing", level: "error", title: "No amount found", detail: "Enter the amount before saving." });

  const lineTotals = n.items.map((i) => i.lineTotalPaise).filter((x): x is number => x !== null);
  const itemsSum = sum(lineTotals);
  const charges = sum([n.otherCharges.value, n.deliveryFee.value, n.packagingFee.value, n.otherTaxes.value]);
  const discount = n.discount.value ?? 0;
  const tax = n.gstAmount.value ?? 0;
  const roundOff = n.roundOff.value ?? 0;
  const tol = Math.max(TOLERANCE_PAISE, lineTotals.length);

  if (lineTotals.length > 0 && n.subtotal.value !== null) {
    const diff = itemsSum - n.subtotal.value;
    if (Math.abs(diff) <= tol) out.push({ id: "items_subtotal", level: "ok", title: "Items add up to the subtotal" });
    else if (Math.abs(itemsSum - discount - n.subtotal.value) <= tol) out.push({ id: "items_subtotal", level: "ok", title: "Items add up to the subtotal after discount" });
    else out.push({ id: "items_subtotal", level: "warning", title: "Items don't add up to the subtotal", detail: `Items total ${fmt(itemsSum)}, subtotal ${fmt(n.subtotal.value)} (difference ${fmt(Math.abs(diff))}). Some items may be misread or missing.` });
  }

  if (n.total.value !== null) {
    const base = n.subtotal.value ?? (lineTotals.length ? itemsSum : null);
    if (base !== null && (n.subtotal.value !== null || lineTotals.length > 0)) {
      const exclusive = base - discount + tax + charges + roundOff;
      const inclusive = base - discount + charges + roundOff;
      if (Math.abs(exclusive - n.total.value) <= tol) out.push({ id: "bill_total", level: "ok", title: "Subtotal, tax, discounts and charges match the total" });
      else if (tax > 0 && Math.abs(inclusive - n.total.value) <= tol) out.push({ id: "bill_total", level: "ok", title: "Total matches — GST appears to be included in the prices" });
      else out.push({ id: "bill_total", level: "warning", title: "The bill doesn't reconcile", detail: `Calculated ${fmt(exclusive)} from the parts, but the printed total is ${fmt(n.total.value)}. Check the amounts before saving.` });
    }
  }

  if (n.gstRate.value !== null && n.gstAmount.value !== null) {
    const base = (n.subtotal.value ?? (lineTotals.length ? itemsSum : null));
    if (base !== null) {
      const taxable = base - discount;
      const exclusive = Math.round((taxable * n.gstRate.value) / 100);
      const inclusive = Math.round((taxable * n.gstRate.value) / (100 + n.gstRate.value));
      const gstTol = Math.max(TOLERANCE_PAISE, Math.round(n.gstAmount.value * 0.02));
      if (Math.abs(exclusive - n.gstAmount.value) <= gstTol || Math.abs(inclusive - n.gstAmount.value) <= gstTol)
        out.push({ id: "gst", level: "ok", title: `GST at ${n.gstRate.value}% matches` });
      else out.push({ id: "gst", level: "warning", title: "GST amount doesn't match the rate", detail: `${n.gstRate.value}% of ${fmt(taxable)} would be about ${fmt(exclusive)}, but the document shows ${fmt(n.gstAmount.value)}. Receipts with several GST rates can differ.` });
    }
  }

  if (n.amountPaid.value !== null && n.total.value !== null && Math.abs(n.amountPaid.value - n.total.value) > TOLERANCE_PAISE)
    out.push({ id: "paid_vs_total", level: "info", title: "Amount paid differs from the bill total", detail: `Bill ${fmt(n.total.value)}, paid ${fmt(n.amountPaid.value)}. SMARTFIN records the amount paid; both are kept.` });

  return out;
}

export function checkDate(dateIso: string | null, n: Pick<NormalisedExtraction, "date" | "dateAmbiguous" | "dateAlternative">, today = new Date()): Check[] {
  if (!n.date.raw && !dateIso) return [{ id: "date_missing", level: "warning", title: "No date found", detail: "Choose the date of this transaction." }];
  if (!dateIso) return [{ id: "date_invalid", level: "error", title: "The date couldn't be read", detail: `Printed as “${n.date.raw}”. Choose the correct date.` }];
  const out: Check[] = [];
  if (n.dateAmbiguous && n.dateAlternative) {
    const f = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    out.push({ id: "date_ambiguous", level: "warning", title: "The date could be read two ways", detail: `“${n.date.raw}” could be ${f(n.date.value ?? dateIso)} (day first) or ${f(n.dateAlternative)} (month first). Confirm which one is right.` });
  }
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (new Date(`${dateIso}T00:00`) > tomorrow) out.push({ id: "date_future", level: "warning", title: "The date is in the future", detail: "Check the date before saving." });
  return out;
}

export function checkQuality(n: Pick<NormalisedExtraction, "imageQuality" | "readableText">): Check[] {
  if (!n.readableText || n.imageQuality === "unreadable") return [{ id: "quality", level: "error", title: "No readable text", detail: "Retake the photo in good light, flat and in focus." }];
  if (n.imageQuality === "poor") return [{ id: "quality", level: "warning", title: "Image quality is poor", detail: "Some values may be misread. Check every field." }];
  return [];
}

const FIELD_NAMES: [keyof NormalisedExtraction, string][] = [
  ["merchant", "merchant"], ["amount", "amount"], ["date", "date"], ["time", "time"], ["reference", "reference"], ["paymentMethod", "payment method"], ["total", "total"], ["amountPaid", "amount paid"],
];
export function checkUncertainFields(n: NormalisedExtraction): Check[] {
  const low = FIELD_NAMES.filter(([k]) => (n[k] as { confidence?: string })?.confidence === "low").map(([, l]) => l);
  const lowItems = n.items.filter((i) => i.confidence === "low").length;
  const out: Check[] = [];
  if (low.length) out.push({ id: "uncertain_fields", level: "warning", title: `${CONFIDENCE_LABELS.low}: ${low.join(", ")}`, detail: "These were hard to read. Compare them with the image." });
  if (lowItems) out.push({ id: "uncertain_items", level: "warning", title: `${lowItems} item${lowItems > 1 ? "s" : ""} hard to read`, detail: "Check the highlighted items." });
  return out;
}

export function runChecks(n: NormalisedExtraction, edited: { amountPaise: number | null; dateIso: string | null }, today?: Date): Check[] {
  return [...checkQuality(n), ...checkAmounts(n, edited.amountPaise), ...checkDate(edited.dateIso, n, today), ...checkUncertainFields(n)];
}

/** Checks that stop saving until the user fixes the value. */
const BLOCKING = new Set(["amount_missing", "date_invalid"]);
export const hasBlockingError = (checks: Check[]) => checks.some((c) => BLOCKING.has(c.id));
