export type TxnType = "income" | "expense" | "refund" | "transfer";
export type EntryMethod = "manual" | "csv" | "receipt" | "demo";

/** Minimal shape the calculation engine needs. */
export interface CalcTxn {
  id: string;
  txn_type: TxnType;
  amount_paise: number;
  category: string | null;
  occurred_at: string; // ISO
  source_id: string | null;
  to_source_id: string | null;
  /** "confirmed" / "user_confirmed" count in totals; anything else is treated as unconfirmed. Missing = confirmed. */
  confirmation_status?: string | null;
}

export interface CalcSource {
  id: string;
  opening_balance_paise: number;
}

export const SOURCE_TYPES = {
  bank: "Bank account",
  gpay: "Google Pay",
  phonepe: "PhonePe",
  paytm: "Paytm",
  debit_card: "Debit card",
  credit_card: "Credit card",
  cash: "Cash",
  other: "Other",
} as const;
export type SourceType = keyof typeof SOURCE_TYPES;

export const ACQUISITION_LABELS = {
  manual: "Manually registered",
  csv: "CSV imported",
  demo: "Demo source",
} as const;

export const TXN_TYPE_LABELS: Record<TxnType, string> = {
  income: "Income",
  expense: "Expense",
  refund: "Refund",
  transfer: "Transfer",
};
