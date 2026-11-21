/** Strict JSON schema + instructions for the document-reading model. No secrets here. */
import { DOCUMENT_TYPE_KEYS } from "./types";

const field = {
  type: "object",
  additionalProperties: false,
  required: ["value", "confidence"],
  properties: {
    value: { type: ["string", "null"], description: "Exactly as printed. null when not visible." },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
} as const;

const fieldNames = ["merchant_name", "counterparty_name", "payer_name", "amount", "currency", "date", "time", "reference_number", "receipt_number", "payment_method", "payment_app", "bank_name", "upi_id", "description", "merchant_address"] as const;
const amountNames = ["subtotal", "discount", "gst_rate", "gst_amount", "cgst", "sgst", "igst", "other_taxes", "other_charges", "delivery_fee", "packaging_fee", "round_off", "total", "amount_paid"] as const;
const obj = (names: readonly string[]) => ({
  type: "object",
  additionalProperties: false,
  required: [...names],
  properties: Object.fromEntries(names.map((n) => [n, field])),
});

export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["document_type", "classification_confidence", "language", "image_quality", "readable_text_found", "status_text", "status", "direction", "counterparty_is_own_account", "payment_state_on_document", "fields", "amounts", "items", "notes_for_review"],
  properties: {
    document_type: { type: "string", enum: DOCUMENT_TYPE_KEYS },
    classification_confidence: { type: "string", enum: ["high", "medium", "low"] },
    language: { type: ["string", "null"] },
    image_quality: { type: "string", enum: ["good", "poor", "unreadable"] },
    readable_text_found: { type: "boolean" },
    status_text: { type: ["string", "null"] },
    status: { type: "string", enum: ["success", "failed", "pending", "unknown"] },
    direction: { type: "string", enum: ["paid_out", "received", "unknown"] },
    counterparty_is_own_account: { type: ["boolean", "null"] },
    payment_state_on_document: { type: "string", enum: ["paid", "unpaid_or_due", "not_stated"] },
    fields: obj(fieldNames),
    amounts: obj(amountNames),
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "unit_price", "line_total", "confidence"],
        properties: {
          name: { type: "string" },
          quantity: { type: ["string", "null"] },
          unit_price: { type: ["string", "null"] },
          line_total: { type: ["string", "null"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    notes_for_review: { type: ["string", "null"] },
  },
} as const;

export const EXTRACTION_INSTRUCTIONS = `You read images of Indian financial documents for a personal finance app and return structured data.

Classify first, then extract. Document types:
- upi_payment: UPI app payment confirmation (Google Pay, PhonePe, Paytm, BHIM etc.)
- bank_debit / bank_credit: bank app or SMS-style screenshot of money leaving / entering an account
- subscription_payment: confirmation of a subscription charge (Netflix, Spotify, etc.)
- retail_receipt, restaurant_receipt (incl. Swiggy/Zomato orders), grocery_receipt
- online_invoice: e-commerce order invoice; utility_bill: electricity, water, gas, internet, mobile bill
- refund_confirmation; failed_payment; pending_payment
- unknown_financial: financial but none of the above; not_financial: no financial content

Rules:
- Copy values EXACTLY as printed (keep ₹, commas, original spelling, original date format like 04/05/2026). Do not convert, reformat, translate or calculate.
- Never invent or infer a value that isn't visible. Use null for anything not shown. Do not compute totals yourself.
- status_text: the literal status words shown (e.g. "Payment Successful", "Transaction failed", "Pending"). null if no words. A green tick, colour or icon alone is NOT a status — leave status_text null and status "unknown" in that case.
- status: summarise status_text only (success / failed / pending / unknown).
- direction: paid_out when the document owner paid / was debited; received when they were paid / credited; unknown otherwise.
- counterparty_is_own_account: true only if the document clearly shows a transfer to the payer's own account (e.g. "Self transfer", same name on both sides); otherwise null.
- payment_state_on_document: "paid" only if the document says it was paid (Paid, Payment received, Amount paid, a payment mode with a transaction ID, "PAID" stamp). "unpaid_or_due" if it shows amount due / due date without a payment. Otherwise "not_stated".
- amount: the main transaction amount (the paid/received amount on payment screens, the grand total on bills).
- amounts.total: final bill/invoice total. amounts.amount_paid: amount actually paid if separately shown. gst_amount: a single printed total-GST line, else null. cgst / sgst / igst: each printed GST component line. gst_rate: the rate(s) as printed, e.g. "18%" or "CGST 2.5% + SGST 2.5%". other_taxes: non-GST taxes/duties (e.g. electricity duty, cess) — never put taxes or duties in items. discount: total discount. round_off: keep its sign.
- reference_number: UPI transaction ID / UTR / RRN / bank reference. receipt_number: bill, invoice, order or receipt number.
- items: every line item separately, in order, with original names. Never merge lines with similar names. Skip subtotal/tax/total lines.
- upi_id only if printed. payment_app: the app name (Google Pay, PhonePe, Paytm, ...).
- NEVER output OTPs, UPI PINs, passwords, CVV / card security codes or full card numbers. If present, ignore them; card numbers only as last 4 digits.
- confidence per value: high = clearly legible; medium = partly legible or inferred from layout; low = guessed from blurry text.
- image_quality: good / poor (blurry, cropped, glare) / unreadable. readable_text_found: false if no text can be read.
- notes_for_review: one short sentence about anything unusual (e.g. multiple receipts in one image, handwritten values), else null.`;
