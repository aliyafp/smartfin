/**
 * Google Pay — Google Takeout exports. Supports:
 *  - "My Activity.html" (Takeout default)
 *  - "My Activity.json"
 *  - "Google transactions" CSV (Time, Transaction ID, Description, Product, Payment method, Status, Amount)
 * Pure: takes file text, returns normalised records.
 */
import Papa from "papaparse";
import { fingerprint } from "../fingerprint";
import { ExportFileError, type ParseResult, type RecordDirection, type RecordType, type SourceRecord } from "../types";
import { decodeEntities, MAX_RECORDS, parseMoney, parseTimestamp, statusFromText, UPI_REF_RE } from "./common";

const PROVIDER = "google_pay";
const TITLE_RE = /^(paid|sent|received|requested|refund(?:ed)?(?:\s+of)?|cashback(?:\s+of)?|won|bought)\s+(?:(?:₹|inr|rs\.?)\s*)([\d,]+(?:\.\d{1,2})?)(?:\s+(to|from|for)\s+(.+?))?(?:\s+using\s+(.+?))?\.?$/i;

interface Entry { row: number; title: string; time: string | null; details: string; }

/** Turn one activity entry into a record, or explain why not. */
export function interpretActivity(e: Entry): { record?: SourceRecord; ignored?: string; rejected?: string } {
  const title = e.title.replace(/\s+/g, " ").trim();
  const m = title.match(TITLE_RE);
  if (!m) {
    if (/^(used|searched|viewed|visited|added|linked|set up|created|updated|opened)\b/i.test(title)) return { ignored: "App activity — not a payment" };
    return { rejected: `Couldn't understand “${title.slice(0, 60)}”` };
  }
  const verb = m[1]!.toLowerCase();
  if (verb === "requested") return { ignored: "Payment request — no money moved" };
  const money = parseMoney(m[2]);
  if (!money || money.paise <= 0) return { rejected: "Amount is missing or zero" };
  const when = parseTimestamp(e.time);
  if (!when) return { rejected: "Date couldn't be read" };
  const counterparty = m[4]?.trim() || null;
  const via = m[5]?.trim() || null;
  let recordType: RecordType = "payment";
  let direction: RecordDirection = "debit";
  if (verb === "received" || verb.startsWith("cashback") || verb === "won") direction = "credit";
  if (verb.startsWith("refund")) { recordType = "refund"; direction = "credit"; }
  const status = e.details ? statusFromText(e.details) : "unknown";
  const ref = `${e.details} ${title}`.match(UPI_REF_RE)?.[1] ?? null;
  return {
    record: {
      providerId: PROVIDER,
      providerRecordId: ref ? `ref:${ref}` : fingerprint(PROVIDER, when.toISOString(), title),
      recordType, status, direction,
      amountPaise: money.paise,
      occurredAt: when.toISOString(),
      description: title.slice(0, 200),
      merchantRaw: counterparty,
      reference: ref,
      orderId: null,
      paymentMethod: via ? (/bank|a\/c|account/i.test(via) ? "UPI" : /card/i.test(via) ? (/credit/i.test(via) ? "Credit card" : "Debit card") : "UPI") : "UPI",
      items: [],
      row: e.row,
    },
  };
}

function htmlEntries(html: string): Entry[] {
  const cells = html.split(/<div[^>]+class="[^"]*outer-cell[^"]*"[^>]*>/i).slice(1);
  return cells.map((cell, i) => {
    const blocks = [...cell.matchAll(/<div[^>]+class="[^"]*content-cell[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)].map((b) =>
      decodeEntities(b[1]!.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).split("\n").map((l) => l.trim()).filter(Boolean));
    const main = blocks[0] ?? [];
    const title = main[0] ?? "";
    const time = main.find((l, j) => j > 0 && parseTimestamp(l)) ?? null;
    const rest = [...main.slice(1).filter((l) => l !== time), ...blocks.slice(1).flat()].join(" ");
    const details = rest.match(/details:\s*(.+)$/i)?.[1] ?? rest;
    return { row: i + 1, title, time, details };
  }).filter((e) => e.title);
}

interface JsonItem { title?: unknown; time?: unknown; details?: unknown; subtitles?: unknown; header?: unknown }
function jsonEntries(text: string): Entry[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new ExportFileError("This JSON file couldn't be read. Choose the “My Activity.json” file from your Google Takeout export."); }
  if (!Array.isArray(data)) throw new ExportFileError("This JSON file isn't a Google activity export.");
  const names = (v: unknown) => (Array.isArray(v) ? v.map((d) => (d && typeof d === "object" && "name" in d ? String((d as { name: unknown }).name) : "")).join(" ") : "");
  return (data as JsonItem[]).map((it, i) => ({
    row: i + 1,
    title: typeof it.title === "string" ? it.title : "",
    time: typeof it.time === "string" ? it.time : null,
    details: `${names(it.details)} ${names(it.subtitles)}`.trim(),
  })).filter((e) => e.title);
}

function csvRecords(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim().toLowerCase() });
  const fields = parsed.meta.fields ?? [];
  if (!fields.includes("time") || !fields.includes("amount") || !fields.includes("description")) {
    throw new ExportFileError("This CSV isn't a Google transactions file. It should have Time, Description, Status and Amount columns.");
  }
  const out: ParseResult = { format: "Google transactions CSV", records: [], rejected: [], ignored: [], total: parsed.data.length };
  parsed.data.forEach((r, i) => {
    const row = i + 2;
    const desc = (r["description"] ?? "").trim();
    const money = parseMoney(r["amount"]);
    const when = parseTimestamp(r["time"]);
    if (!money || money.paise <= 0) return void out.rejected.push({ row, reason: "Amount is missing or zero" });
    if (!when) return void out.rejected.push({ row, reason: "Date couldn't be read" });
    const statusText = r["status"] ?? "";
    const isRefund = /refund/i.test(`${statusText} ${desc}`) || money.sign === 1;
    const id = (r["transaction id"] ?? "").trim();
    out.records.push({
      providerId: PROVIDER,
      providerRecordId: id ? `txn:${id}` : fingerprint(PROVIDER, when.toISOString(), desc, money.paise),
      recordType: isRefund ? "refund" : "payment",
      status: isRefund ? "success" : statusFromText(statusText),
      direction: isRefund ? "credit" : "debit",
      amountPaise: money.paise,
      occurredAt: when.toISOString(),
      description: desc.slice(0, 200) || "Google payment",
      merchantRaw: desc || (r["product"] ?? null),
      reference: id || null,
      orderId: null,
      paymentMethod: (r["payment method"] ?? "").trim() || null,
      items: [],
      row,
    });
  });
  return out;
}

export function parseGooglePayExport(fileName: string, text: string): ParseResult {
  const t = text.replace(/^\uFEFF/, "");
  if (!t.trim()) throw new ExportFileError("This file is empty.");
  const name = fileName.toLowerCase();
  let format: string, entries: Entry[];
  if (name.endsWith(".csv")) return cap(csvRecords(t));
  if (name.endsWith(".json") || t.trimStart().startsWith("[")) { format = "My Activity (JSON)"; entries = jsonEntries(t); }
  else if (/<html|<div/i.test(t)) { format = "My Activity (HTML)"; entries = htmlEntries(t); }
  else throw new ExportFileError("Choose “My Activity.html”, “My Activity.json” or a Google transactions CSV from your Takeout export.");
  if (!entries.length) throw new ExportFileError("No Google Pay activity was found in this file. Make sure it's the Google Pay activity file from Takeout.");
  const out: ParseResult = { format, records: [], rejected: [], ignored: [], total: entries.length };
  for (const e of entries) {
    const r = interpretActivity(e);
    if (r.record) out.records.push(r.record);
    else if (r.ignored) out.ignored.push({ row: e.row, reason: r.ignored });
    else out.rejected.push({ row: e.row, reason: r.rejected ?? "Couldn't be read" });
  }
  return cap(out);
}

function cap(r: ParseResult): ParseResult {
  if (r.records.length > MAX_RECORDS) throw new ExportFileError(`This file has ${r.records.length.toLocaleString("en-IN")} payments. Export up to ${MAX_RECORDS.toLocaleString("en-IN")} at a time by choosing a shorter date range.`);
  return r;
}
