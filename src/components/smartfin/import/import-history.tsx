import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronRight, FileSpreadsheet, History, Loader2, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, ErrorNote, SectionTitle, SkeletonBlock } from "@/components/smartfin/ui-bits";
import { deleteImport, importsQuery, STATEMENT_KINDS, STATUS_LABELS, type ImportBatch, type StatementKind } from "@/lib/data/imports";
import { errorMessage, type Source } from "@/lib/data/queries";
import { cn } from "@/lib/utils";

export function ImportHistory({ sourceMap }: { sourceMap: Map<string, Source> }) {
  const q = useQuery(importsQuery);
  const qc = useQueryClient();
  const [removing, setRemoving] = useState<ImportBatch | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await deleteImport(removing.id);
      await qc.invalidateQueries();
      toast.success("Import removed with its transactions");
      setRemoving(null);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <section aria-labelledby="import-history">
      <SectionTitle title="Import history" />
      {q.error ? <ErrorNote message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : q.isLoading || (q.isFetching && !q.data?.length) ? <SkeletonBlock className="h-24" /> : !q.data?.length ? (
        <div className="flex items-center gap-3 rounded-3xl border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground"><History className="size-5 shrink-0" />No imports yet. Your imported files will be listed here.</div>
      ) : (
        <Card className="divide-y divide-border p-0">
          {q.data.map((b) => {
            const issues = b.status === "completed_with_issues";
            const src = b.source_id ? sourceMap.get(b.source_id) : undefined;
            return (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-violet/15 text-transfer"><FileSpreadsheet className="size-5" /></span>
                <Link to="/transactions" search={{ batch: b.id }} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{b.file_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · {STATEMENT_KINDS[b.statement_kind as StatementKind]?.label ?? "CSV"}{src ? ` · ${src.name}` : ""}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="font-semibold text-income">{b.imported_count} imported</span>
                    {b.invalid_count > 0 && <span className="font-semibold text-destructive">{b.invalid_count} rejected</span>}
                    {b.skipped_count > 0 && <span className="text-muted-foreground">{b.skipped_count} skipped</span>}
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", issues ? "bg-saffron/25 text-plum" : "bg-turquoise/20 text-income")}>{STATUS_LABELS[b.status] ?? b.status}</span>
                  </p>
                </Link>
                <button aria-label={`Remove import ${b.file_name}`} onClick={() => setRemoving(b)} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </div>
            );
          })}
        </Card>
      )}
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this import?</AlertDialogTitle>
            <AlertDialogDescription>This deletes the {removing?.imported_count ?? 0} transactions created from “{removing?.file_name}”. Manually entered transactions aren't affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); void remove(); }} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}Remove import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
