/**
 * Amazon "Request My Data" → Retail.OrderHistory CSV. One row per item; rows are
 * grouped into one order per Order ID with its items. Pure.
 */
import Papa from "papaparse";
import { parseStatementDate } from "@/lib/import/statement";
import { ExportFileError, type OrderItem, type ParseResult, type RecordStatus } from "../types";
import { MAX_RECORDS, parseMoney } from "./common";

const PROVIDER = "amazon";

function parseOrderDate(raw: string): Date | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return parseStatementDate(s, "ymd");
  return parseStatementDate(s.replace(/\s*UTC$/i, ""), "mdy");
}

export function parseAmazonOrders(text: string): ParseResult {
  const t = text.replace(/^\uFEFF/, "");
  if (!t.trim()) throw new ExportFileError("This file is empty.");
  const parsed = Papa.parse<Record<string, string>>(t, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim().toLowerCase() });
  const f = new Set(parsed.meta.fields ?? []);
  if (!f.has("order id") || !f.has("order date") || !(f.has("total owed") || f.has("total amount"))) {
    throw new ExportFileError("This isn't Amazon's order history file. Choose “Retail.OrderHistory” CSV from your Amazon data download (it has Order ID, Order Date and Total Owed columns).");
  }
  const totalCol = f.has("total owed") ? "total owed" : "total amount";
  const groups = new Map<string, { rows: number[]; date: Date | null; currency: string; items: OrderItem[]; owed: number; cancelled: number; pending: number; total: number; payment: string | null; bad: string | null }>();
  parsed.data.forEach((r, i) => {
    const row = i + 2;
    const id = (r["order id"] ?? "").trim();
    if (!id) return;
    const g = groups.get(id) ?? { rows: [], date: parseOrderDate(r["order date"] ?? ""), currency: (r["currency"] ?? "INR").trim().toUpperCase() || "INR", items: [], owed: 0, cancelled: 0, pending: 0, total: 0, payment: null, bad: null };
    g.rows.push(row);
    g.total++;
    const status = (r["order status"] ?? "").trim();
    const isCancelled = /cancel/i.test(status);
    const isPending = /^(new|pending|authori[sz]ed|payment\s*pending)/i.test(status);
    const amount = parseMoney(r[totalCol]);
    if (isCancelled) g.cancelled++;
    else if (isPending) g.pending++;
    if (!isCancelled) {
      if (!amount) g.bad = g.bad ?? `Row ${row}: order amount is missing`;
      else g.owed += amount.paise;
    }
    const name = (r["product name"] ?? "").trim();
    if (name) {
      const q = Number((r["quantity"] ?? "").trim());
      g.items.push({ name: name.slice(0, 200), quantity: Number.isFinite(q) && q > 0 ? q : null, lineTotalPaise: amount?.paise ?? null });
    }
    const pay = (r["payment instrument type"] ?? "").trim();
    if (pay && !/not available/i.test(pay)) g.payment = pay.slice(0, 60);
    groups.set(id, g);
  });
  if (!groups.size) throw new ExportFileError("No orders were found in this file.");
  if (groups.size > MAX_RECORDS) throw new ExportFileError(`This file has ${groups.size.toLocaleString("en-IN")} orders. Import up to ${MAX_RECORDS.toLocaleString("en-IN")} at a time.`);
  const out: ParseResult = { format: "Amazon order history", records: [], rejected: [], ignored: [], total: groups.size };
  for (const [id, g] of groups) {
    const row = g.rows[0]!;
    if (g.currency !== "INR") { out.rejected.push({ row, reason: `Order ${id} is in ${g.currency}; only Indian rupee (INR) orders are supported` }); continue; }
    if (!g.date) { out.rejected.push({ row, reason: `Order ${id}: date couldn't be read` }); continue; }
    if (g.bad) { out.rejected.push({ row, reason: g.bad }); continue; }
    const allCancelled = g.cancelled === g.total;
    const status: RecordStatus = allCancelled ? "cancelled" : g.pending === g.total - g.cancelled ? "pending" : "success";
    if (!allCancelled && g.owed <= 0) { out.rejected.push({ row, reason: `Order ${id}: total is zero` }); continue; }
    const first = g.items[0]?.name ?? "Amazon order";
    out.records.push({
      providerId: PROVIDER,
      providerRecordId: `order:${id}`,
      recordType: allCancelled ? "cancellation" : "order",
      status,
      direction: "debit",
      amountPaise: allCancelled ? g.items.reduce((s, i) => s + (i.lineTotalPaise ?? 0), 0) : g.owed,
      occurredAt: g.date.toISOString(),
      description: `Amazon: ${first.slice(0, 80)}${g.items.length > 1 ? ` +${g.items.length - 1} more` : ""}`,
      merchantRaw: "Amazon",
      reference: null,
      orderId: id.slice(0, 64),
      paymentMethod: g.payment,
      items: g.items,
      row,
    });
  }
  return out;
}
