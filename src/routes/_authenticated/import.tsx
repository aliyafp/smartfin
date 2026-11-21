import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BarChart3, CheckCircle2, ListOrdered, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, ErrorNote, PageHeader, SkeletonBlock } from "@/components/smartfin/ui-bits";
import { ImportStepper } from "@/components/smartfin/import/stepper";
import { UploadStep, type LoadedFile } from "@/components/smartfin/import/upload-step";
import { MapStep } from "@/components/smartfin/import/map-step";
import { ReviewStep } from "@/components/smartfin/import/review-step";
import { ImportHistory } from "@/components/smartfin/import/import-history";
import { useFinanceData } from "@/hooks/use-finance-data";
import { errorMessage } from "@/lib/data/queries";
import { saveStatement, type StatementKind } from "@/lib/data/imports";
import { formatMoney } from "@/lib/finance/money";
import { buildReview, reviewTotals, toPayload, type ReviewRow } from "@/lib/import/review";
import { guessDateOrder, normaliseRows, type DateOrder, type InvalidRow, type Mapping } from "@/lib/import/statement";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import CSV — SMARTFIN" }, { name: "description", content: "Import transactions from a bank statement or UPI CSV file." }] }),
  component: ImportPage,
});

type Stage = "upload" | "map" | "review" | "done";
const STEP: Record<Stage, number> = { upload: 0, map: 1, review: 2, done: 3 };

function ImportPage() {
  const { txns, sources, sourceMap, isLoading, error, refetch } = useFinanceData();
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>("upload");
  const [kind, setKind] = useState<StatementKind>("bank");
  const [sourceId, setSourceId] = useState("");
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [dateOrder, setDateOrder] = useState<DateOrder>("dmy");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [invalid, setInvalid] = useState<InvalidRow[]>([]);
  const [batchId, setBatchId] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ imported: number; rejected: number; skipped: number; income: number; expenses: number; batch: string } | null>(null);

  const go = (s: Stage) => { setStage(s); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const toMapping = () => {
    if (!file) return;
    setMapping(file.mapping);
    setDateOrder(guessDateOrder(file.mapping.date ? file.rows.map((r) => r[file.mapping.date!] ?? "") : []));
    go("map");
  };

  const toReview = () => {
    if (!file) return;
    const { valid, invalid: bad } = normaliseRows(file.rows, mapping, dateOrder, file.shapeErrors);
    if (valid.length === 0 && bad.length === 0) { toast.error("No transactions were found in this file."); return; }
    setRows(buildReview(valid, txns, sourceId));
    setInvalid(bad);
    setBatchId(crypto.randomUUID()); // a fresh id per review; retrying the same save can't double-import
    go("review");
  };

  const save = async () => {
    if (!file) return;
    const payload = toPayload(rows);
    const totals = reviewTotals(rows, invalid.length);
    setSaving(true);
    try {
      await saveStatement({ id: batchId, source: sourceId, file: file.name, kind, rows: payload, total: totals.total, invalid: totals.invalid, duplicates: totals.duplicates });
      await qc.invalidateQueries();
      setResult({ imported: payload.length, rejected: totals.invalid, skipped: totals.valid - totals.selected, income: totals.incomePaise, expenses: totals.expensePaise, batch: batchId });
      go("done");
    } catch (e) {
      toast.error(`Nothing was saved. ${errorMessage(e)}`);
    } finally { setSaving(false); }
  };

  const reset = () => { setFile(null); setRows([]); setInvalid([]); setResult(null); setMapping({}); go("upload"); };

  return (
    <div className="space-y-5">
      <PageHeader title="Import CSV" subtitle="Bank statements and UPI exports" back="/transactions" />
      <ImportStepper step={STEP[stage]} />

      {error ? <ErrorNote message={errorMessage(error)} onRetry={refetch} /> : isLoading ? <SkeletonBlock className="h-96" /> : (
        <div key={stage} className="animate-rise">
          {stage === "upload" && <UploadStep sources={sources} kind={kind} setKind={setKind} sourceId={sourceId} setSourceId={setSourceId} file={file} setFile={setFile} onNext={toMapping} />}
          {stage === "map" && file && <MapStep file={file} mapping={mapping} setMapping={setMapping} dateOrder={dateOrder} setDateOrder={setDateOrder} onBack={() => go("upload")} onNext={toReview} />}
          {stage === "review" && file && (
            <ReviewStep rows={rows} setRows={setRows} invalid={invalid} sourceName={sourceMap.get(sourceId)?.name ?? "your source"} fileName={file.name} saving={saving} onBack={() => go("map")} onSave={save} />
          )}
          {stage === "done" && result && (
            <Card className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto size-12 text-income" />
              <div>
                <h2 className="text-xl font-extrabold">{result.imported.toLocaleString("en-IN")} transactions imported</h2>
                <p className="mt-1 text-sm text-muted-foreground">They now appear on your dashboard, transactions, analytics and monthly report.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-left">
                <div className="rounded-2xl bg-turquoise/15 p-3"><p className="text-[11px] font-semibold text-muted-foreground">Income</p><p className="num font-extrabold">{formatMoney(result.income)}</p></div>
                <div className="rounded-2xl bg-coral/10 p-3"><p className="text-[11px] font-semibold text-muted-foreground">Expenses</p><p className="num font-extrabold">{formatMoney(result.expenses)}</p></div>
              </div>
              {(result.rejected > 0 || result.skipped > 0) && <p className="text-xs text-muted-foreground">{result.rejected > 0 ? `${result.rejected} invalid row${result.rejected === 1 ? " was" : "s were"} rejected. ` : ""}{result.skipped > 0 ? `${result.skipped} unticked row${result.skipped === 1 ? " was" : "s were"} skipped.` : ""}</p>}
              <div className="flex flex-col gap-2">
                <Button asChild><Link to="/transactions" search={{ batch: result.batch }}><ListOrdered />View imported transactions</Link></Button>
                <Button asChild variant="soft"><Link to="/compare"><BarChart3 />See monthly comparison</Link></Button>
                <Button variant="ghost" onClick={reset}><Upload />Import another file</Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {(stage === "upload" || stage === "done") && !isLoading && <ImportHistory sourceMap={sourceMap} />}
    </div>
  );
}
