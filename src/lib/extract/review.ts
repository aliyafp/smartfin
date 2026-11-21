/** Review-screen model: initial values from an extraction and the save payload. Pure. */
import { paiseToInput, parseAmountToPaise } from "@/lib/finance/money";
import type { TxnType } from "@/lib/finance/types";
import { primaryAmount } from "./normalise";
import { suggestItemCategory, type CategoryRule, type CategorySuggestion } from "./categorise";
import type { Interpretation } from "./interpret";
import type { Confidence, DocumentType, NormalisedExtraction } from "./types";

export interface ReviewForm {
  docType: DocumentType;
  txnType: TxnType | null;
  amount: string;
  merchant: string;
  description: string;
  category: string;
  date: string;
  time: string;
  sourceId: string;
  toSourceId: string;
  paymentMethod: string;
  reference: string;
  notes: string;
}

export interface ReviewItem {
  id: string;
  originalName: string;
  name: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  category: string;
  suggested: string | null;
  confidence: Confidence;
  edited: boolean;
}

export function initialForm(n: NormalisedExtraction, i: Interpretation, cat: CategorySuggestion, docType: DocumentType = n.documentType): ReviewForm {
  const amount = primaryAmount(n);
  return {
    docType,
    txnType: i.txnType,
    amount: amount !== null ? paiseToInput(amount) : "",
    merchant: n.merchantNormalised ?? n.merchant.value ?? n.counterparty.value ?? "",
    description: n.description.value ?? "",
    // Only pre-fill a category we're reasonably sure about; low-confidence guesses are shown as hints.
    category: cat.category && cat.confidence !== "low" ? cat.category : "",
    date: n.date.value ?? "",
    time: n.time.value ?? "",
    sourceId: "",
    toSourceId: "",
    paymentMethod: n.paymentMethod.value ?? "",
    reference: (n.reference.value ?? "").slice(0, 64),
    notes: "",
  };
}

export function initialItems(n: NormalisedExtraction, rules: CategoryRule[] = [], docType: DocumentType = n.documentType): ReviewItem[] {
  return n.items.map((it) => {
    const s = suggestItemCategory(it.originalName, rules, docType);
    return {
      id: it.id,
      originalName: it.originalName,
      name: it.originalName,
      quantity: it.quantity !== null ? String(it.quantity) : "",
      unitPrice: it.unitPricePaise !== null ? paiseToInput(it.unitPricePaise) : "",
      lineTotal: it.lineTotalPaise !== null ? paiseToInput(it.lineTotalPaise) : "",
      category: s.category && s.confidence !== "low" ? s.category : "",
      suggested: s.category,
      confidence: it.confidence,
      edited: false,
    };
  });
}

export type FormErrors = Partial<Record<"amount" | "txnType" | "date" | "time" | "merchant" | "source" | "to" | "reference" | "notes" | "items", string>>;

export interface SavePayload {
  txn: {
    txn_type: TxnType; amount_paise: number; description: string; merchant: string | null; category: string | null; occurred_at: string;
    source_id: string | null; to_source_id: string | null; payment_method: string | null; reference: string | null; notes: string | null;
  };
  items: { original_name: string; normalised_name: string | null; quantity: number | null; unit_price_paise: number | null; line_total_paise: number | null; category: string | null; confidence: string; review_status: string }[];
}

const optionalPaise = (s: string): number | null | "invalid" => {
  if (!s.trim()) return null;
  const p = parseAmountToPaise(s);
  return p === null ? "invalid" : p;
};

/**
 * Validates the reviewed values and builds ONE parent transaction plus its item rows.
 * Items are details of the purchase and are never turned into separate payments.
 */
export function buildSavePayload(f: ReviewForm, items: ReviewItem[]): { ok: true; payload: SavePayload } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  const paise = parseAmountToPaise(f.amount);
  if (paise === null || paise <= 0) errors.amount = "Enter the amount, e.g. 265 or 1,250.50";
  else if (paise >= 100000000000) errors.amount = "Amount is too large";
  if (!f.txnType) errors.txnType = "Choose what kind of transaction this is";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errors.date = "Choose the date";
  if (f.time && !/^\d{2}:\d{2}$/.test(f.time)) errors.time = "Enter a valid time";
  const when = new Date(`${f.date}T${f.time || "12:00"}`);
  if (!errors.date && Number.isNaN(when.getTime())) errors.date = "Choose a valid date";
  const description = (f.merchant.trim() || f.description.trim()).slice(0, 120);
  if (!description) errors.merchant = "Add the merchant or a description";
  if (f.reference.trim().length > 64) errors.reference = "Max 64 characters";
  if (f.notes.trim().length > 500) errors.notes = "Max 500 characters";
  if (f.txnType === "transfer") {
    if (!f.sourceId) errors.source = "Choose where money moved from";
    if (!f.toSourceId) errors.to = "Choose where money moved to";
    else if (f.toSourceId === f.sourceId) errors.to = "Pick a different source";
  }
  const outItems: SavePayload["items"] = [];
  for (const it of items) {
    const name = it.name.trim();
    if (!name) continue;
    const unit = optionalPaise(it.unitPrice), line = optionalPaise(it.lineTotal);
    const qty = it.quantity.trim() ? Number(it.quantity) : null;
    if (unit === "invalid" || line === "invalid" || (qty !== null && (!Number.isFinite(qty) || qty <= 0))) { errors.items = `Check the numbers for “${name.slice(0, 40)}”`; continue; }
    outItems.push({
      original_name: it.originalName || name,
      normalised_name: name !== it.originalName ? name.slice(0, 120) : null,
      quantity: qty, unit_price_paise: unit, line_total_paise: line,
      category: it.category || null, confidence: it.confidence, review_status: it.edited ? "edited" : "confirmed",
    });
  }
  if (Object.keys(errors).length || paise === null || !f.txnType) return { ok: false, errors };
  return {
    ok: true,
    payload: {
      txn: {
        txn_type: f.txnType, amount_paise: paise, description, merchant: f.merchant.trim().slice(0, 80) || null,
        category: f.txnType === "transfer" ? null : f.category || null, occurred_at: when.toISOString(),
        source_id: f.sourceId || null, to_source_id: f.txnType === "transfer" ? f.toSourceId : null,
        payment_method: f.paymentMethod || null, reference: f.reference.trim() || null, notes: f.notes.trim() || null,
      },
      items: outItems,
    },
  };
}

/** Converts edited items back into the shape the checks use. */
export function itemsForChecks(items: ReviewItem[]) {
  return items.map((it) => ({ lineTotalPaise: optionalPaiseOrNull(it.lineTotal) }));
}
function optionalPaiseOrNull(s: string) { const p = optionalPaise(s); return p === "invalid" ? null : p; }
