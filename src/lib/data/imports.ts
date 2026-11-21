/** Statement import data access: history, atomic save and removal. */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";

export type ImportBatch = Tables<"import_batches">;

export const STATEMENT_KINDS = {
  bank: { label: "Bank statement", hint: "Download the CSV from your bank's net banking or app (Statements → Download → CSV)." },
  upi: { label: "UPI export", hint: "Use the CSV download of your UPI transaction history, if your app offers one." },
  gpay: { label: "Google Pay", hint: "Only if you have a CSV of your Google Pay history. Otherwise, import the bank statement linked to Google Pay." },
  phonepe: { label: "PhonePe", hint: "Only if you have a CSV of your PhonePe history. An Excel download can be saved as CSV first." },
  paytm: { label: "Paytm", hint: "Paytm's statement download can be opened in a spreadsheet and saved as CSV." },
  other: { label: "Other CSV", hint: "Any CSV with a date, a description and amounts (or debit and credit columns)." },
} as const;
export type StatementKind = keyof typeof STATEMENT_KINDS;

export const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  completed_with_issues: "Completed · some rows not imported",
};

export const importsQuery = queryOptions({
  queryKey: ["imports"],
  queryFn: async (): Promise<ImportBatch[]> => {
    const all: ImportBatch[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("import_batches").select("*").order("created_at", { ascending: false }).range(from, from + 999);
      if (error) throw error;
      all.push(...data);
      if (data.length < 1000) return all;
    }
  },
});

export interface ImportRowPayload { txn_type: "income" | "expense" | "refund"; amount_paise: number; description: string; merchant: string | null; occurred_at: string; reference: string | null; category: string | null }
export interface ImportPlan { id: string; source: string; file: string; kind: StatementKind; rows: ImportRowPayload[]; total: number; invalid: number; duplicates: number }

/** Saves every confirmed row in one transaction. Re-sending the same plan id is a no-op. */
export async function saveStatement(plan: ImportPlan) {
  const { data, error } = await supabase.rpc("import_statement", {
    p_batch_id: plan.id, p_source_id: plan.source, p_file_name: plan.file, p_statement_kind: plan.kind,
    p_rows: plan.rows as unknown as Json, p_total_rows: plan.total, p_invalid_count: plan.invalid, p_duplicate_count: plan.duplicates,
  });
  if (error) throw error;
  return data;
}

/** Removes an import and every transaction it created. Other transactions are untouched. */
export async function deleteImport(id: string) {
  const { error: tErr } = await supabase.from("transactions").delete().eq("import_batch_id", id).eq("entry_method", "csv");
  if (tErr) throw tErr;
  const { error } = await supabase.from("import_batches").delete().eq("id", id);
  if (error) throw error;
}
