/**
 * Cross-source matching: the same spending seen by several sources (an Amazon
 * order, the Google Pay payment and the bank debit) is linked to ONE
 * transaction. Exact references first, then amount + date + merchant. Pure.
 */
import { isCountable } from "@/lib/finance/engine";
import type { SourceRecord } from "../types";
import type { Interpretation } from "./interpret";
import { canonicalMerchant, sameMerchant } from "./merchant";

export interface ExistingForMatch {
  id: string; txn_type: string; amount_paise: number; occurred_at: string;
  merchant: string | null; description: string; reference: string | null;
  provider_id?: string | null; confirmation_status?: string | null;
}

export interface Match { txnId: string; score: number; reasons: string[]; strength: "strong" | "possible" }

export const STRONG_SCORE = 90;
export const POSSIBLE_SCORE = 65;
const DAY = 86_400_000;
const normRef = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function scoreMatch(rec: SourceRecord, interp: Interpretation, txn: ExistingForMatch): { score: number; reasons: string[] } | null {
  if (!interp.txnType || txn.txn_type !== interp.txnType || !isCountable(txn)) return null;
  if (txn.provider_id && txn.provider_id === rec.providerId) return null; // two records from one provider are two payments
  const a = normRef(rec.reference), b = normRef(txn.reference);
  if (a.length >= 6 && a === b) return { score: 100, reasons: ["Same reference number"] };
  if (txn.amount_paise !== rec.amountPaise) return null;
  const days = Math.abs(new Date(txn.occurred_at).getTime() - new Date(rec.occurredAt).getTime()) / DAY;
  const window = rec.recordType === "order" ? 7 : 3;
  if (days > window) return null;
  const reasons = ["Same amount"];
  let score = 50;
  if (days < 1 && new Date(txn.occurred_at).toDateString() === new Date(rec.occurredAt).toDateString()) { score += 25; reasons.push("same day"); }
  else if (days <= 1) { score += 20; reasons.push("1 day apart"); }
  else if (days <= 3) { score += 15; reasons.push(`${Math.round(days)} days apart`); }
  else { score += 8; reasons.push(`${Math.round(days)} days apart`); }
  const recName = canonicalMerchant(rec.merchantRaw) ?? canonicalMerchant(rec.description);
  if (sameMerchant(recName, txn.merchant) || sameMerchant(recName, txn.description)) { score += 25; reasons.push("same merchant"); }
  return { score: Math.min(100, score), reasons };
}

/**
 * Best match per record. Each existing transaction is used at most once, and
 * never for a provider that's already linked to it.
 */
export function findMatches(
  rows: { key: string; record: SourceRecord; interp: Interpretation }[],
  existing: ExistingForMatch[],
  linkedProviders: Map<string, Set<string>> = new Map(),
): Map<string, Match> {
  const pairs: { key: string; txnId: string; score: number; reasons: string[] }[] = [];
  for (const r of rows) {
    if (!r.interp.txnType) continue;
    for (const t of existing) {
      if (linkedProviders.get(t.id)?.has(r.record.providerId)) continue;
      const s = scoreMatch(r.record, r.interp, t);
      if (s && s.score >= POSSIBLE_SCORE) pairs.push({ key: r.key, txnId: t.id, ...s });
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  const out = new Map<string, Match>();
  const used = new Set<string>();
  for (const p of pairs) {
    if (out.has(p.key) || used.has(p.txnId)) continue;
    out.set(p.key, { txnId: p.txnId, score: p.score, reasons: p.reasons, strength: p.score >= STRONG_SCORE ? "strong" : "possible" });
    used.add(p.txnId);
  }
  return out;
}
