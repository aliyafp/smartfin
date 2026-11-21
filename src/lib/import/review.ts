/** Turns parsed statement rows into reviewable rows and computes preview totals. Pure. */
import { findDuplicates, suggestCategory, type DupKind, type ExistingTxn, type ImportTxnType, type ParsedRow } from "./statement";

export interface ReviewRow extends ParsedRow {
  dup: DupKind | null;
  /** user's decision; duplicates and possible transfers start unticked */
  include: boolean;
  category: string | null;
}

export function buildReview(valid: ParsedRow[], existing: ExistingTxn[], sourceId: string): ReviewRow[] {
  const dups = findDuplicates(valid, existing, sourceId);
  return valid.map((r) => {
    const dup = dups.get(r.row) ?? null;
    return { ...r, dup, include: !dup && !r.possibleTransfer, category: suggestCategory(`${r.merchant ?? ""} ${r.description}`, r.type) };
  });
}

/** Re-suggest the category when the user flips the type (income categories differ from expense ones). */
export function withType(r: ReviewRow, type: ImportTxnType): ReviewRow {
  return { ...r, type, category: suggestCategory(`${r.merchant ?? ""} ${r.description}`, type) };
}

export interface ReviewTotals {
  total: number; valid: number; invalid: number; duplicates: number; transfers: number; selected: number;
  incomePaise: number; expensePaise: number; refundPaise: number; uncategorised: number;
}

/** Totals for the preview. Income/expenses only count rows the user has selected. */
export function reviewTotals(rows: ReviewRow[], invalidCount: number): ReviewTotals {
  let income = 0, expense = 0, refund = 0, selected = 0, uncategorised = 0;
  for (const r of rows) {
    if (!r.include) continue;
    selected++;
    if (!r.category) uncategorised++;
    if (r.type === "income") income += r.amountPaise;
    else if (r.type === "expense") expense += r.amountPaise;
    else refund += r.amountPaise;
  }
  return {
    total: rows.length + invalidCount, valid: rows.length, invalid: invalidCount,
    duplicates: rows.filter((r) => r.dup).length, transfers: rows.filter((r) => r.possibleTransfer).length, selected,
    incomePaise: income, expensePaise: expense - refund, refundPaise: refund, uncategorised,
  };
}

export function toPayload(rows: ReviewRow[]) {
  return rows.filter((r) => r.include).map((r) => ({
    txn_type: r.type, amount_paise: r.amountPaise, description: r.description, merchant: r.merchant,
    occurred_at: r.date.toISOString(), reference: r.reference, category: r.category,
  }));
}
