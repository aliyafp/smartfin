/**
 * Builds the review list for one sync and turns the user's choices into the
 * payload for the atomic `ingest_source_records` database function. Pure.
 * Nothing is dropped silently: already-imported and repeated rows are counted,
 * matches are shown with their score, and the user confirms every action.
 */
import { suggestCategory } from "@/lib/import/statement";
import { getProvider } from "../providers";
import type { ParseResult, SourceRecord } from "../types";
import { interpretRecord, type Interpretation } from "./interpret";
import { findMatches, type ExistingForMatch, type Match } from "./match";
import { canonicalMerchant } from "./merchant";

export type Action = "create" | "link" | "record_only";

export interface ReviewRow {
  key: string;
  record: SourceRecord;
  interp: Interpretation;
  merchant: string | null;
  category: string | null;
  action: Action;
  include: boolean;
  /** Best existing transaction this looks like (strong → linked by default, possible → flagged). */
  match: Match | null;
}

export interface ConnectReview {
  rows: ReviewRow[];
  alreadyImported: number;
  repeatedInFile: number;
  parse: ParseResult;
}

export function suggestRecordCategory(rec: SourceRecord, interp: Interpretation, merchant: string | null): string | null {
  if (!interp.txnType) return null;
  const provider = getProvider(rec.providerId);
  const text = `${merchant ?? ""} ${rec.description}`;
  if (interp.txnType === "income") return suggestCategory(text, "income");
  if (rec.recordType === "order" && provider?.defaultCategory) return provider.defaultCategory;
  return suggestCategory(text, interp.txnType) ?? (interp.txnType === "expense" ? provider?.defaultCategory ?? null : null);
}

export function buildConnectReview(parse: ParseResult, ctx: {
  existingTxns: ExistingForMatch[];
  existingRecordIds: Set<string>;
  linkedProviders?: Map<string, Set<string>>;
}): ConnectReview {
  let alreadyImported = 0, repeatedInFile = 0;
  const seen = new Set<string>();
  const base: { key: string; record: SourceRecord; interp: Interpretation }[] = [];
  for (const rec of parse.records) {
    if (ctx.existingRecordIds.has(rec.providerRecordId)) { alreadyImported++; continue; }
    if (seen.has(rec.providerRecordId)) { repeatedInFile++; continue; }
    seen.add(rec.providerRecordId);
    base.push({ key: rec.providerRecordId, record: rec, interp: interpretRecord(rec) });
  }
  const matches = findMatches(base, ctx.existingTxns, ctx.linkedProviders);
  const rows = base.map(({ key, record, interp }): ReviewRow => {
    const merchant = canonicalMerchant(record.merchantRaw) ?? canonicalMerchant(record.description);
    const match = matches.get(key) ?? null;
    const action: Action = interp.effect === "not_counted" ? "record_only" : match?.strength === "strong" ? "link" : "create";
    return { key, record, interp, merchant, category: suggestRecordCategory(record, interp, merchant), action, include: !interp.needsReview, match };
  });
  rows.sort((a, b) => b.record.occurredAt.localeCompare(a.record.occurredAt));
  return { rows, alreadyImported, repeatedInFile, parse };
}

export function needsAttention(r: ReviewRow): boolean {
  return r.interp.needsReview || (r.match?.strength === "possible" && r.action === "create");
}

export interface ReviewCounts {
  received: number; create: number; link: number; recordOnly: number; skipped: number; review: number;
  duplicates: number; rejected: number; ignored: number;
  expensePaise: number; incomePaise: number; refundPaise: number;
}

export function reviewCounts(rv: ConnectReview): ReviewCounts {
  const c: ReviewCounts = { received: rv.parse.total, create: 0, link: 0, recordOnly: 0, skipped: 0, review: 0, duplicates: rv.alreadyImported + rv.repeatedInFile, rejected: rv.parse.rejected.length, ignored: rv.parse.ignored.length, expensePaise: 0, incomePaise: 0, refundPaise: 0 };
  for (const r of rv.rows) {
    if (needsAttention(r)) c.review++;
    if (!r.include) { c.skipped++; continue; }
    if (r.action === "record_only") { c.recordOnly++; continue; }
    if (r.action === "link") { c.link++; continue; }
    c.create++;
    if (r.interp.txnType === "expense") c.expensePaise += r.record.amountPaise;
    else if (r.interp.txnType === "income") c.incomePaise += r.record.amountPaise;
    else if (r.interp.txnType === "refund") c.refundPaise += r.record.amountPaise;
  }
  return c;
}

export interface IngestGroup {
  action: Action;
  link_transaction_id?: string;
  match_score?: number;
  txn?: { txn_type: string; amount_paise: number; description: string; merchant: string | null; category: string | null; occurred_at: string; payment_method: string | null; reference: string | null; notes: string | null };
  records: Record<string, unknown>[];
}

function recordPayload(r: ReviewRow): Record<string, unknown> {
  const x = r.record;
  return {
    provider_record_id: x.providerRecordId, record_type: x.recordType, status: x.status, direction: x.direction,
    amount_paise: x.amountPaise, occurred_at: x.occurredAt, merchant_raw: x.merchantRaw, merchant: r.merchant,
    description: x.description, reference: x.reference, order_id: x.orderId, payment_method: x.paymentMethod,
    items: x.items.map((i) => ({ name: i.name, quantity: i.quantity, line_total_paise: i.lineTotalPaise })),
    interpretation: r.interp.reason.slice(0, 200),
  };
}

/** Selected rows → one group each. Unticked rows are not sent. */
export function toIngestGroups(rows: ReviewRow[]): IngestGroup[] {
  return rows.filter((r) => r.include).map((r): IngestGroup => {
    if (r.action === "link" && r.match) return { action: "link", link_transaction_id: r.match.txnId, match_score: r.match.score, records: [recordPayload(r)] };
    if (r.action === "create" && r.interp.txnType) {
      const x = r.record;
      const description = (x.recordType === "order" ? x.description : r.merchant ?? x.description).slice(0, 120) || "Imported transaction";
      return {
        action: "create",
        txn: { txn_type: r.interp.txnType, amount_paise: x.amountPaise, description, merchant: r.merchant, category: r.category, occurred_at: x.occurredAt, payment_method: x.paymentMethod, reference: x.reference ?? x.orderId, notes: null },
        records: [recordPayload(r)],
      };
    }
    return { action: "record_only", records: [recordPayload(r)] };
  });
}
