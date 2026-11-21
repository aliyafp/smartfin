import { cleanReference } from "./normalise";
/** Finds existing SMARTFIN transactions that a scan may duplicate. Pure; never deletes or merges anything. */
export interface ExistingForDup {
  id: string; txn_type: string; amount_paise: number; occurred_at: string; reference: string | null; description: string; merchant: string | null; notes?: string | null;
}
export type DupKind = "reference" | "receipt_number" | "same_details" | "similar";
export interface DupMatch { id: string; kind: DupKind; reason: string }

export const DUP_PRIORITY: Record<DupKind, number> = { reference: 0, receipt_number: 1, same_details: 2, similar: 3 };

const normRef = (s: string | null | undefined) => (cleanReference(s) ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const normName = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const day = (iso: string) => { const d = new Date(iso); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000; };

function namesMatch(a: string, b: string) {
  if (!a || !b) return false;
  return a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b));
}

export function findScanDuplicates(c: {
  reference: string | null; receiptNumber: string | null; merchant: string | null; description: string | null; amountPaise: number | null; dateIso: string | null; txnType: string | null;
}, existing: ExistingForDup[]): DupMatch[] {
  const out = new Map<string, DupMatch>();
  const add = (m: DupMatch) => { const prev = out.get(m.id); if (!prev || DUP_PRIORITY[m.kind] < DUP_PRIORITY[prev.kind]) out.set(m.id, m); };
  const ref = normRef(c.reference);
  const rcpt = normRef(c.receiptNumber);
  const name = normName(c.merchant ?? c.description);
  const cDay = c.dateIso ? day(`${c.dateIso}T12:00`) : null;

  for (const t of existing) {
    if (ref.length >= 6 && normRef(t.reference) === ref) { add({ id: t.id, kind: "reference", reason: "Same reference number" }); continue; }
    if (rcpt.length >= 4 && (normRef(t.reference) === rcpt || (t.notes && normRef(t.notes).includes(rcpt) && rcpt.length >= 6))) { add({ id: t.id, kind: "receipt_number", reason: "Same receipt / invoice number" }); continue; }
    if (c.amountPaise === null || t.amount_paise !== c.amountPaise) continue;
    if (c.txnType && t.txn_type !== c.txnType) continue;
    if (cDay === null) continue;
    const gap = Math.abs(day(t.occurred_at) - cDay);
    const tName = normName(t.merchant ?? t.description);
    if (gap === 0 && namesMatch(name, tName)) add({ id: t.id, kind: "same_details", reason: "Same merchant, date and amount" });
    else if (gap === 0) add({ id: t.id, kind: "similar", reason: "Same date and amount" });
    else if (gap <= 1 && namesMatch(name, tName)) add({ id: t.id, kind: "similar", reason: "Same merchant and amount, one day apart" });
  }
  return [...out.values()].sort((a, b) => DUP_PRIORITY[a.kind] - DUP_PRIORITY[b.kind]);
}
