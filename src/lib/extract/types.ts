/** Shared types for Scan & Extract. Pure — safe in browser, server and tests. */

export const DOCUMENT_TYPES = {
  upi_payment: { label: "UPI payment screenshot", meaning: "Payment confirmation", kind: "payment" },
  bank_debit: { label: "Bank debit", meaning: "Outgoing transaction", kind: "payment" },
  bank_credit: { label: "Bank credit", meaning: "Incoming transaction", kind: "payment" },
  subscription_payment: { label: "Subscription payment", meaning: "Payment confirmation", kind: "payment" },
  retail_receipt: { label: "Retail receipt", meaning: "Purchase details", kind: "receipt" },
  restaurant_receipt: { label: "Restaurant / food delivery", meaning: "Food purchase", kind: "receipt" },
  grocery_receipt: { label: "Grocery bill", meaning: "Itemised purchase", kind: "receipt" },
  online_invoice: { label: "Online invoice", meaning: "Purchase or order document", kind: "bill" },
  utility_bill: { label: "Utility bill", meaning: "Bill or payment evidence", kind: "bill" },
  refund_confirmation: { label: "Refund confirmation", meaning: "Refund", kind: "refund" },
  failed_payment: { label: "Failed payment", meaning: "Failed transaction", kind: "payment" },
  pending_payment: { label: "Pending payment", meaning: "Pending transaction", kind: "payment" },
  unknown_financial: { label: "Other financial document", meaning: "Requires review", kind: "unknown" },
  not_financial: { label: "Not a financial document", meaning: "Nothing to record", kind: "unknown" },
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;
export const DOCUMENT_TYPE_KEYS = Object.keys(DOCUMENT_TYPES) as DocumentType[];

export type Confidence = "high" | "medium" | "low" | "not_detected";
export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  not_detected: "Not detected",
};

export type PaymentStatus = "success" | "failed" | "pending" | "unknown";
export type Direction = "paid_out" | "received" | "unknown";
export type PaymentStateOnDocument = "paid" | "unpaid_or_due" | "not_stated";
export type ImageQuality = "good" | "poor" | "unreadable";

/** What the reading model returns for one value: the text exactly as printed, plus its own confidence. */
export interface RawField { value: string | null; confidence: "high" | "medium" | "low" }

export interface RawItem { name: string; quantity: string | null; unit_price: string | null; line_total: string | null; confidence: "high" | "medium" | "low" }

/** Exact shape of the AI response (mirrors the strict JSON schema in ai-schema.ts). */
export interface RawExtraction {
  document_type: DocumentType;
  classification_confidence: "high" | "medium" | "low";
  language: string | null;
  image_quality: ImageQuality;
  readable_text_found: boolean;
  status_text: string | null;
  status: PaymentStatus;
  direction: Direction;
  counterparty_is_own_account: boolean | null;
  payment_state_on_document: PaymentStateOnDocument;
  fields: {
    merchant_name: RawField; counterparty_name: RawField; payer_name: RawField; amount: RawField; currency: RawField;
    date: RawField; time: RawField; reference_number: RawField; receipt_number: RawField; payment_method: RawField;
    payment_app: RawField; bank_name: RawField; upi_id: RawField; description: RawField; merchant_address: RawField;
  };
  amounts: {
    subtotal: RawField; discount: RawField; gst_rate: RawField; gst_amount: RawField; cgst: RawField; sgst: RawField; igst: RawField; other_taxes: RawField; other_charges: RawField;
    delivery_fee: RawField; packaging_fee: RawField; round_off: RawField; total: RawField; amount_paid: RawField;
  };
  items: RawItem[];
  notes_for_review: string | null;
}

export interface Field<T> { value: T | null; raw: string | null; confidence: Confidence }

export interface NormItem {
  id: string;
  originalName: string;
  normalisedName: string | null;
  quantity: number | null;
  unitPricePaise: number | null;
  lineTotalPaise: number | null;
  confidence: Confidence;
}

/** Cleaned, typed extraction: amounts in integer paise, dates as YYYY-MM-DD, times as HH:MM. */
export interface NormalisedExtraction {
  documentType: DocumentType;
  classificationConfidence: "high" | "medium" | "low";
  language: string | null;
  imageQuality: ImageQuality;
  readableText: boolean;
  statusText: string | null;
  status: PaymentStatus;
  direction: Direction;
  ownAccount: boolean | null;
  paymentState: PaymentStateOnDocument;
  merchant: Field<string>;
  merchantNormalised: string | null;
  counterparty: Field<string>;
  payer: Field<string>;
  amount: Field<number>;
  currency: Field<string>;
  date: Field<string>;
  dateAmbiguous: boolean;
  dateAlternative: string | null;
  time: Field<string>;
  reference: Field<string>;
  receiptNumber: Field<string>;
  paymentMethod: Field<string>;
  paymentApp: Field<string>;
  bankName: Field<string>;
  upiId: Field<string>;
  description: Field<string>;
  merchantAddress: Field<string>;
  subtotal: Field<number>;
  discount: Field<number>;
  gstRate: Field<number>;
  gstAmount: Field<number>;
  otherTaxes: Field<number>;
  otherCharges: Field<number>;
  deliveryFee: Field<number>;
  packagingFee: Field<number>;
  roundOff: Field<number>;
  total: Field<number>;
  amountPaid: Field<number>;
  items: NormItem[];
  notesForReview: string | null;
}

export type TxnState =
  | "completed_expense" | "completed_income" | "refund" | "transfer"
  | "pending_payment" | "failed_payment" | "unpaid_invoice" | "unknown";

export const TXN_STATE_LABELS: Record<TxnState, string> = {
  completed_expense: "Completed expense",
  completed_income: "Completed income",
  refund: "Refund",
  transfer: "Transfer between your accounts",
  pending_payment: "Pending payment",
  failed_payment: "Failed payment",
  unpaid_invoice: "Unpaid bill / invoice",
  unknown: "Needs your review",
};

export type ProcessingStatus = "uploaded" | "processing" | "extracted" | "failed" | "waiting" | "confirmed" | "discarded";

export type ExtractErrorCode =
  | "not_found" | "no_image" | "consent_required" | "busy" | "credits" | "blocked" | "service_unavailable"
  | "timeout" | "no_text" | "not_financial" | "bad_response" | "save_failed";
