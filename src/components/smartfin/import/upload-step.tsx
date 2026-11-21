import { useRef, useState, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Lock, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, InlineAlert, NativeSelect, SectionTitle } from "@/components/smartfin/ui-bits";
import { createSource, errorMessage, qk, type Source } from "@/lib/data/queries";
import { STATEMENT_KINDS, type StatementKind } from "@/lib/data/imports";
import { SOURCE_TYPES, type SourceType } from "@/lib/finance/types";
import { checkStatementFile, readStatementCsv, StatementFileError } from "@/lib/import/csv";
import { cn } from "@/lib/utils";

export type LoadedFile = ReturnType<typeof readStatementCsv> & { name: string; size: number };

const KIND_TO_SOURCE: Record<StatementKind, SourceType> = { bank: "bank", upi: "other", gpay: "gpay", phonepe: "phonepe", paytm: "paytm", other: "other" };

export function UploadStep({ sources, kind, setKind, sourceId, setSourceId, file, setFile, onNext }: {
  sources: Source[]; kind: StatementKind; setKind: (k: StatementKind) => void; sourceId: string; setSourceId: (id: string) => void;
  file: LoadedFile | null; setFile: (f: LoadedFile | null) => void; onNext: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(sources.length === 0);
  const qc = useQueryClient();

  const read = async (f: File | undefined) => {
    if (!f) return;
    setError(null); setFile(null);
    const problem = checkStatementFile(f);
    if (problem) { setError(problem); return; }
    setReading(true);
    try {
      const text = await f.text();
      setFile({ ...readStatementCsv(text), name: f.name.slice(0, 200), size: f.size });
    } catch (e) {
      setError(e instanceof StatementFileError ? e.message : "This file couldn't be read. It may be damaged — try downloading it again.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); void read(e.dataTransfer.files[0]); };

  const addSource = async () => {
    const name = newName.trim() || STATEMENT_KINDS[kind].label;
    if (name.length > 60) { toast.error("Source name can be up to 60 characters"); return; }
    setCreating(true);
    try {
      const s = await createSource({ name, source_type: KIND_TO_SOURCE[kind], acquisition_method: "csv", opening_balance_paise: 0 });
      await qc.invalidateQueries({ queryKey: qk.sources });
      setSourceId(s.id); setShowNew(false); setNewName("");
      toast.success(`Source “${s.name}” added`);
    } catch (e) { toast.error(errorMessage(e)); } finally { setCreating(false); }
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <SectionTitle title="1. What kind of file is it?" />
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Statement type">
          {(Object.keys(STATEMENT_KINDS) as StatementKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={cn("rounded-2xl border px-2 py-2.5 text-xs font-semibold transition-colors", kind === k ? "border-coral bg-coral/10 text-coral" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
              {STATEMENT_KINDS[k].label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{STATEMENT_KINDS[kind].hint}</p>
      </Card>

      <Card className="space-y-3">
        <SectionTitle title="2. Which account is this from?" />
        {sources.length > 0 && (
          <NativeSelect label="Source" value={sourceId} onChange={setSourceId} placeholder="Choose a source" options={sources.map((s) => [s.id, `${s.name} · ${SOURCE_TYPES[s.source_type as SourceType] ?? "Other"}`])} />
        )}
        {showNew ? (
          <div className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`Name, e.g. ${kind === "bank" ? "HDFC Savings" : STATEMENT_KINDS[kind].label}`} aria-label="New source name" className="h-11 rounded-2xl" />
            <Button type="button" onClick={addSource} disabled={creating}>{creating ? <Loader2 className="animate-spin" /> : <Plus />}Add</Button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowNew(true)} className="text-sm font-semibold text-coral">+ Add a new source</button>
        )}
        <p className="text-xs text-muted-foreground">Imported transactions are saved under this source. SMARTFIN doesn't connect to your bank or UPI app.</p>
      </Card>

      <Card className="space-y-3">
        <SectionTitle title="3. Choose the CSV file" />
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => void read(e.target.files?.[0])} />
        <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
          className={cn("flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-4 py-8 text-center transition-colors", dragging ? "border-coral bg-coral/5" : "border-border bg-muted/40 hover:border-coral/60")}>
          {reading ? <Loader2 className="size-8 animate-spin text-coral" /> : file ? <FileSpreadsheet className="size-8 text-coral" /> : <Upload className="size-8 text-coral" />}
          {file ? (
            <>
              <span className="max-w-full truncate font-bold">{file.name}</span>
              <span className="text-xs text-muted-foreground">{file.rows.length.toLocaleString("en-IN")} rows · {file.headers.length} columns · {(file.size / 1024).toFixed(file.size < 10240 ? 1 : 0)} KB — tap to choose another</span>
            </>
          ) : (
            <>
              <span className="font-bold">{reading ? "Reading file…" : "Import CSV"}</span>
              <span className="text-xs text-muted-foreground">Tap to choose a .csv file (up to 5 MB)</span>
            </>
          )}
        </button>
        {error && <InlineAlert tone="error" title="Couldn't use this file">{error}</InlineAlert>}
        {file && file.skippedLines > 0 && (
          <p className="text-xs text-muted-foreground">Skipped {file.skippedLines} line{file.skippedLines > 1 ? "s" : ""} of account details above the column headings.</p>
        )}
        <p className="flex items-start gap-2 text-xs text-muted-foreground"><Lock className="mt-0.5 size-3.5 shrink-0" />The file is read on this device and isn't uploaded or stored. Only the transactions you confirm are saved to your account.</p>
      </Card>

      <Button size="lg" className="w-full" disabled={!file || !sourceId} onClick={onNext}>
        {!sourceId ? "Choose a source to continue" : !file ? "Choose a file to continue" : "Next: check columns"}
      </Button>
    </div>
  );
}
