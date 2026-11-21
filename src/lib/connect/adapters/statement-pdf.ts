/** Converts AI-read statement rows (PhonePe / Google Pay PDFs) into normalised records. Pure. */
import { parseStatementDate } from "@/lib/import/statement";
import { fingerprint } from "../fingerprint";
import type { ParseResult, RecordStatus, SourceRecord } from "../types";
import { parseMoney } from "./common";

export interface PdfRow {
  date: string | null; // as printed
  time: string | null;
  description: string | null;
  counterparty: string | null;
  direction: "debit" | "credit" | "unknown";
  amount: string | null;
  status: "success" | "failed" | "pending" | "unknown";
  reference: string | null;
}

export interface PdfReading { is_statement: boolean; provider_seen: string | null; rows: PdfRow[] }

const SELF_RE = /\b(self\s*transfer|to\s*self|own\s*account|transfer\s*to\s*(your\s*)?bank)\b/i;

export function recordsFromPdf(providerId: string, reading: PdfReading): ParseResult {
  const out: ParseResult = { format: "Statement PDF", records: [], rejected: [], ignored: [], total: reading.rows.length };
  reading.rows.forEach((r, i) => {
    const row = i + 1;
    const money = parseMoney(r.amount);
    const when = r.date ? (parseStatementDate(r.date, "dmy", r.time ?? "") ?? parseStatementDate(r.date, "mdy", r.time ?? "")) : null;
    if (!money || money.paise <= 0) return void out.rejected.push({ row, reason: "Amount is missing or zero" });
    if (!when) return void out.rejected.push({ row, reason: "Date couldn't be read" });
    if (r.direction === "unknown") return void out.rejected.push({ row, reason: "Can't tell whether money went out or came in" });
    const desc = (r.description || r.counterparty || "Statement entry").trim();
    const isRefund = /\brefund/i.test(desc) && r.direction === "credit";
    const ref = r.reference?.replace(/\s+/g, "").slice(0, 64) || null;
    const status: RecordStatus = r.status;
    const rec: SourceRecord = {
      providerId,
      providerRecordId: ref ? `ref:${ref}` : fingerprint(providerId, when.toISOString(), desc, money.paise, r.direction),
      recordType: isRefund ? "refund" : SELF_RE.test(desc) ? "transfer" : "payment",
      status,
      direction: r.direction,
      amountPaise: money.paise,
      occurredAt: when.toISOString(),
      description: desc.slice(0, 200),
      merchantRaw: r.counterparty?.trim() || null,
      reference: ref,
      orderId: null,
      paymentMethod: "UPI",
      items: [],
      row,
    };
    out.records.push(rec);
  });
  return out;
}
