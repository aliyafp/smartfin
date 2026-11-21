/** Shared shapes for Connect Your Apps. Pure types — no I/O. */

export type ProviderCategory = "payments" | "shopping" | "food" | "transport" | "subscriptions" | "banks" | "email";

/** What SMARTFIN can honestly offer for a provider today. */
export type CapabilityStatus =
  | "available" // a working, verified import route exists in SMARTFIN
  | "awaiting_setup" // technically possible, needs workspace configuration first
  | "needs_approval" // provider must approve SMARTFIN (developer programme / review)
  | "partner_required" // needs a regulated or invite-only partnership
  | "unsupported"; // no verified, permitted route

export type ConnectionMethod = "file_export" | "statement_pdf" | "oauth" | "partner";

export type DataType = "payments" | "orders" | "order_items" | "refunds" | "cancellations" | "merchant" | "payment_method" | "reference" | "status";

export type RecordType = "payment" | "order" | "refund" | "cancellation" | "pending" | "subscription" | "transfer";
export type RecordStatus = "success" | "failed" | "pending" | "cancelled" | "refunded" | "unknown";
export type RecordDirection = "debit" | "credit" | "unknown";

export interface OrderItem { name: string; quantity: number | null; lineTotalPaise: number | null }

/** One normalised record from any provider, before it is matched or saved. */
export interface SourceRecord {
  providerId: string;
  /** Stable id: the provider's own id when it has one, otherwise a fingerprint of the row. */
  providerRecordId: string;
  recordType: RecordType;
  status: RecordStatus;
  direction: RecordDirection;
  amountPaise: number;
  occurredAt: string; // ISO
  description: string;
  merchantRaw: string | null;
  reference: string | null;
  orderId: string | null;
  paymentMethod: string | null;
  items: OrderItem[];
  /** 1-based row/entry number in the file, for error messages. */
  row: number;
}

export interface RowProblem { row: number; reason: string }

export interface ParseResult {
  format: string;
  records: SourceRecord[];
  /** Rows that look like transactions but can't be used (missing amount, bad date…). */
  rejected: RowProblem[];
  /** Entries that are not money movements at all (payment requests, reminders…). */
  ignored: RowProblem[];
  total: number;
}

export class ExportFileError extends Error {}
