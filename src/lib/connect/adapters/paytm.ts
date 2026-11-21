/**
 * Paytm UPI statement (Excel or CSV). Columns seen in Paytm's download:
 * Date, Time, Transaction Details, Other Transaction Details (UPI ID or A/c No), Your Account,
 * Amount, UPI Ref No., Order ID, Remarks, Tags, Comment. An optional Status column is honoured.
 * Pure: takes the sheet as rows of strings.
 */
import { parseStatementDate } from "@/lib/import/statement";
import { fingerprint } from "../fingerprint";
import { ExportFileError, type ParseResult, type RecordType, type SourceRecord } from "../types";
import { MAX_RECORDS, parseMoney, statusFromText } from "./common";

const PROVIDER = "paytm";
const SELF_RE = /\b(self\s*transfer|to\s*self|own\s*account|added\s*(money\s*)?to\s*(paytm\s*)?wallet|wallet\s*top-?up|transfer(red)?\s*to\s*bank)\b/i;

function findHeader(rows: string[][]): number {
  return rows.findIndex((r) => {
    const cells = r.map((c) => c.trim().toLowerCase());
    return cells.includes("date") && cells.some((c) => c.startsWith("transaction details")) && cells.some((c) => c.startsWith("amount"));
  });
}

export function parsePaytmStatement(rows: string[][]): ParseResult {
  const h = findHeader(rows);
  if (h < 0) throw new ExportFileError("This doesn't look like a Paytm UPI statement. It should have Date, Transaction Details and Amount columns.");
  const header = rows[h]!.map((c) => c.trim().toLowerCase());
  const col = (re: RegExp) => header.findIndex((c) => re.test(c));
  const ci = {
    date: col(/^date$/), time: col(/^time$/), details: col(/^transaction details$/), other: col(/^other transaction details/),
    amount: col(/^amount/), ref: col(/^upi ref/), order: col(/^order id/), remarks: col(/^remarks/), status: col(/^status/),
  };
  const body = rows.slice(h + 1).filter((r) => r.some((c) => c.trim()));
  if (!body.length) throw new ExportFileError("This statement has headings but no transactions.");
  if (body.length > MAX_RECORDS) throw new ExportFileError(`This statement has ${body.length.toLocaleString("en-IN")} rows. Download up to ${MAX_RECORDS.toLocaleString("en-IN")} at a time by choosing a shorter date range.`);
  const out: ParseResult = { format: "Paytm UPI statement", records: [], rejected: [], ignored: [], total: body.length };
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  body.forEach((r, i) => {
    const row = h + i + 2;
    const details = get(r, ci.details);
    const money = parseMoney(get(r, ci.amount));
    const when = parseStatementDate(get(r, ci.date), "dmy", get(r, ci.time));
    if (!money || money.paise <= 0) return void out.rejected.push({ row, reason: "Amount is missing or zero" });
    if (!when) return void out.rejected.push({ row, reason: "Date couldn't be read" });
    let direction: SourceRecord["direction"] = money.sign === -1 ? "debit" : money.sign === 1 ? "credit" : "unknown";
    if (direction === "unknown") direction = /^(paid|sent|money sent|payment)\b/i.test(details) ? "debit" : /^(received|refund)\b/i.test(details) ? "credit" : "unknown";
    if (direction === "unknown") return void out.rejected.push({ row, reason: "Can't tell whether money went out or came in" });
    let recordType: RecordType = "payment";
    if (/\brefund/i.test(details)) recordType = "refund";
    else if (SELF_RE.test(`${details} ${get(r, ci.remarks)}`)) recordType = "transfer";
    const ref = get(r, ci.ref).replace(/^'/, "") || null;
    const merchant = details.replace(/^(paid\s+to|money\s+sent\s+to|sent\s+to|received\s+from|refund\s+from|payment\s+to)\s+/i, "").trim() || null;
    out.records.push({
      providerId: PROVIDER,
      providerRecordId: ref ? `ref:${ref}` : fingerprint(PROVIDER, when.toISOString(), details, money.paise, direction),
      recordType,
      status: ci.status >= 0 ? statusFromText(get(r, ci.status)) : "success", // Paytm's UPI statement lists completed payments
      direction: recordType === "refund" ? "credit" : direction,
      amountPaise: money.paise,
      occurredAt: when.toISOString(),
      description: (details || "Paytm payment").slice(0, 200),
      merchantRaw: merchant,
      reference: ref,
      orderId: get(r, ci.order) || null,
      paymentMethod: "UPI",
      items: [],
      row,
    });
  });
  return out;
}
