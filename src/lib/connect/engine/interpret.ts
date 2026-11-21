/**
 * Decides what a provider record means for your money. Shared by every source:
 * orders aren't payments, cancelled orders and failed/pending payments never
 * count, refunds reduce spending (never income), transfers are excluded.
 */
import type { SourceRecord } from "../types";

export type Effect = "expense" | "income" | "refund" | "not_counted";
export interface Interpretation {
  effect: Effect;
  /** Transaction type to save when the record counts. */
  txnType: "expense" | "income" | "refund" | null;
  label: string;
  reason: string;
  /** True when the user should look before it's counted (left unticked by default). */
  needsReview: boolean;
}

const notCounted = (label: string, reason: string): Interpretation => ({ effect: "not_counted", txnType: null, label, reason, needsReview: false });

export function interpretRecord(r: Pick<SourceRecord, "recordType" | "status" | "direction">): Interpretation {
  if (r.status === "failed") return notCounted("Failed", "Failed payment — no money moved, so it isn't counted.");
  if (r.status === "pending" || r.recordType === "pending") return notCounted("Pending", "Pending — it will only count once it completes.");
  if (r.status === "cancelled" || r.recordType === "cancellation") return notCounted("Cancelled", "Cancelled order — not spending.");
  if (r.recordType === "transfer") return notCounted("Transfer", "Transfer between your own accounts — not spending or income.");
  if (r.status === "refunded" && r.direction !== "credit") return notCounted("Refunded", "This payment was refunded, so it isn't counted as spending.");
  const unknown = r.status === "unknown";
  const check = unknown ? " The file doesn't show a status — check it before saving." : "";
  if (r.recordType === "refund") return { effect: "refund", txnType: "refund", label: "Refund", reason: `Refund — reduces your spending; it isn't income.${check}`, needsReview: unknown };
  if (r.direction === "credit") return { effect: "income", txnType: "income", label: "Money received", reason: `Money received.${check}`, needsReview: unknown };
  if (r.direction === "debit") {
    if (r.recordType === "order") return { effect: "expense", txnType: "expense", label: "Order", reason: `Order — counted as spending. If the same payment is already recorded from your bank or UPI app, it's linked instead of added twice.${check}`, needsReview: unknown };
    if (r.recordType === "subscription") return { effect: "expense", txnType: "expense", label: "Subscription", reason: `Subscription charge.${check}`, needsReview: unknown };
    return { effect: "expense", txnType: "expense", label: "Payment", reason: `Completed payment.${check}`, needsReview: unknown };
  }
  return notCounted("Unclear", "Can't tell whether money went out or came in.");
}

/** Only active connections may import. */
export const connectionCanSync = (status: string | null | undefined) => status === "active";
