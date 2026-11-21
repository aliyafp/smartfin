/**
 * Financial interpretation: decides what a document represents. Pure, rule-based, separate from reading.
 * A screenshot's design (green tick, colours) is never proof — only the printed status text counts.
 */
import type { TxnType } from "@/lib/finance/types";
import { DOCUMENT_TYPES, type DocumentType, type NormalisedExtraction, type TxnState } from "./types";

export interface Interpretation {
  state: TxnState;
  /** Transaction type to save as; null when the document must not become a transaction yet. */
  txnType: TxnType | null;
  /** Only completed expense / income / refund / transfer can be saved as a transaction. */
  savable: boolean;
  /** The user must explicitly confirm the meaning (e.g. money received, unclear payment). */
  needsConfirmation: boolean;
  /** Ask the user to choose the document type before anything else. */
  needsTypeChoice: boolean;
  reasons: string[];
}

type Input = Pick<NormalisedExtraction, "documentType" | "classificationConfidence" | "statusText" | "status" | "direction" | "ownAccount" | "paymentState" | "amountPaid" | "paymentMethod" | "reference">;

const FAILED_RE = /\b(failed|failure|declined|unsuccessful|not\s+successful|rejected|cancell?ed|reversed\s+to\s+your|could\s+not\s+be\s+processed)\b/i;
const PENDING_RE = /\b(pending|processing|in\s+progress|awaiting|initiated|under\s+process|will\s+be\s+(credited|refunded))\b/i;
const SUCCESS_RE = /\b(success(ful(ly)?)?|paid|completed|sent|received|debited|credited|done|approved|refunded)\b/i;
const REFUND_DONE_RE = /\b(refunded|refund\s+(successful|completed|processed|credited)|credited)\b/i;

/** Reads the printed status words; returns null when there are none. */
export function statusFromText(text: string | null): "success" | "failed" | "pending" | null {
  if (!text || !text.trim()) return null;
  if (FAILED_RE.test(text)) return "failed";
  if (PENDING_RE.test(text)) return "pending";
  if (SUCCESS_RE.test(text)) return "success";
  return null;
}

export function interpret(n: Input, docTypeOverride?: DocumentType | null): Interpretation {
  const docType = docTypeOverride ?? n.documentType;
  const kind = DOCUMENT_TYPES[docType].kind;
  const reasons: string[] = [];
  const textStatus = statusFromText(n.statusText);
  // Printed words win over the model's summary when they disagree.
  const status = textStatus ?? (n.statusText ? n.status : "unknown");
  const typeUncertain = !docTypeOverride && (n.classificationConfidence === "low" || docType === "unknown_financial");
  const out = (state: TxnState, txnType: TxnType | null, needsConfirmation: boolean): Interpretation => ({
    state, txnType, savable: txnType !== null, needsConfirmation: needsConfirmation || typeUncertain, needsTypeChoice: typeUncertain, reasons,
  });

  if (docType === "not_financial") {
    reasons.push("This doesn't look like a payment, receipt or bill.");
    return out("unknown", null, true);
  }
  if (docType === "failed_payment" || status === "failed") {
    reasons.push(n.statusText ? `Status on the document: “${n.statusText}”.` : "The document is marked as a failed payment.");
    reasons.push("Failed payments are not added to your spending.");
    return out("failed_payment", null, false);
  }
  if (docType === "pending_payment" || status === "pending") {
    reasons.push(n.statusText ? `Status on the document: “${n.statusText}”.` : "The document is marked as pending.");
    reasons.push("Pending payments are kept aside until you confirm they went through.");
    return out("pending_payment", null, false);
  }
  if (docType === "refund_confirmation") {
    if (status === "success" && (!n.statusText || REFUND_DONE_RE.test(n.statusText) || SUCCESS_RE.test(n.statusText))) {
      reasons.push("Refunds reduce your spending — they are not counted as income.");
      return out("refund", "refund", false);
    }
    reasons.push("No printed confirmation that the refund was completed.");
    return out("refund", "refund", true);
  }
  if (n.ownAccount === true) {
    reasons.push("Money appears to move between your own accounts. Transfers don't count as spending or income.");
    return out("transfer", "transfer", true);
  }
  if (kind === "payment") {
    if (!n.statusText) {
      reasons.push("No payment status text was found. A tick mark or colour alone isn't treated as proof of payment.");
      return out("unknown", null, true);
    }
    if (status !== "success") {
      reasons.push(`The status “${n.statusText}” doesn't clearly say the payment completed.`);
      return out("unknown", null, true);
    }
    const dir = n.direction !== "unknown" ? n.direction : docType === "bank_credit" ? "received" : docType === "bank_debit" || docType === "subscription_payment" ? "paid_out" : "unknown";
    if (dir === "paid_out") { reasons.push(`Status on the document: “${n.statusText}”.`); return out("completed_expense", "expense", false); }
    if (dir === "received") {
      reasons.push(`Status on the document: “${n.statusText}”.`);
      reasons.push("Money received is saved as income only after you confirm it isn't a refund, repayment or transfer.");
      return out("completed_income", "income", true);
    }
    reasons.push("Couldn't tell whether money was sent or received.");
    return out("unknown", null, true);
  }
  const paidEvidence = n.paymentState === "paid" || n.amountPaid.value !== null || n.paymentMethod.value !== null;
  if (kind === "receipt") {
    if (n.paymentState === "unpaid_or_due") { reasons.push("The receipt shows an amount due, not a payment."); return out("unpaid_invoice", null, false); }
    if (paidEvidence) return out("completed_expense", "expense", false);
    reasons.push("The receipt doesn't show how it was paid — confirm you paid it.");
    return out("completed_expense", "expense", true);
  }
  if (kind === "bill") {
    if (n.paymentState !== "unpaid_or_due" && paidEvidence) {
      reasons.push("The bill shows a payment.");
      return out("completed_expense", "expense", false);
    }
    reasons.push("A bill or invoice isn't proof of payment. It's kept aside until you mark it paid.");
    return out("unpaid_invoice", null, false);
  }
  reasons.push("SMARTFIN couldn't tell what this document represents.");
  return out("unknown", null, true);
}

/** User decision in review: treat a waiting/unknown document as a completed transaction of this type. */
export function confirmAs(i: Interpretation, txnType: TxnType): Interpretation {
  const state: TxnState = txnType === "expense" ? "completed_expense" : txnType === "income" ? "completed_income" : txnType;
  return { ...i, state, txnType, savable: true, needsConfirmation: false, needsTypeChoice: false };
}
