import { useMemo, useState } from "react";
import { ArrowLeftRight, CircleAlert, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, InlineAlert, SectionTitle } from "@/components/smartfin/ui-bits";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/finance/categories";
import { formatMoney } from "@/lib/finance/money";
import { reviewTotals, withType, type ReviewRow } from "@/lib/import/review";
import { DUP_LABELS, type ImportTxnType, type InvalidRow } from "@/lib/import/statement";
import { cn } from "@/lib/utils";

type Filter = "all" | "ready" | "duplicates" | "transfers" | "uncategorised" | "invalid";
const PAGE = 40;

export function ReviewStep({ rows, setRows, invalid, sourceName, fileName, saving, onBack, onSave }: {
  rows: ReviewRow[]; setRows: (r: ReviewRow[]) => void; invalid: InvalidRow[]; sourceName: string; fileName: string; saving: boolean; onBack: () => void; onSave: () => void;
}) {
  const totals = useMemo(() => reviewTotals(rows, invalid.length), [rows, invalid.length]);
  const [filter, setFilter] = useState<Filter>(totals.duplicates ? "duplicates" : "all");
  const [limit, setLimit] = useState(PAGE);
  const [confirm, setConfirm] = useState(false);

  const shown = useMemo(() => rows.filter((r) => {
    switch (filter) {
      case "ready": return r.include;
      case "duplicates": return r.dup !== null;
      case "transfers": return r.possibleTransfer;
      case "uncategorised": return r.include && !r.category;
      default: return true;
    }
  }), [rows, filter]);

  const update = (row: number, patch: (r: ReviewRow) => ReviewRow) => setRows(rows.map((r) => (r.row === row ? patch(r) : r)));
  const setAll = (include: boolean) => { const ids = new Set(shown.map((r) => r.row)); setRows(rows.map((r) => (ids.has(r.row) ? { ...r, include } : r))); };

  const chips: [Filter, string, number][] = [
    ["all", "All", rows.length], ["ready", "Selected", totals.selected], ["duplicates", "Possible duplicates", totals.duplicates],
    ["transfers", "Possible transfers", totals.transfers], ["uncategorised", "Uncategorised", totals.uncategorised], ["invalid", "Invalid", invalid.length],
  ];

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <SectionTitle title="Import summary" />
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Records detected" value={totals.total.toLocaleString("en-IN")} />
          <Stat label="Valid transactions" value={totals.valid.toLocaleString("en-IN")} tone="bg-turquoise/15" />
          <Stat label="Invalid records" value={totals.invalid.toLocaleString("en-IN")} tone={totals.invalid ? "bg-destructive/10" : undefined} />
          <Stat label="Potential duplicates" value={totals.duplicates.toLocaleString("en-IN")} tone={totals.duplicates ? "bg-saffron/25" : undefined} />
          <Stat label="Income (selected)" value={formatMoney(totals.incomePaise)} tone="bg-turquoise/15" />
          <Stat label="Expenses (selected)" value={formatMoney(totals.expensePaise)} tone="bg-coral/10" />
        </div>
        {totals.refundPaise > 0 && <p className="text-xs text-muted-foreground">Expenses are shown after {formatMoney(totals.refundPaise)} in refunds. Refunds are never counted as income.</p>}
        {totals.duplicates > 0 && <InlineAlert tone="warning" icon={<Copy className="size-4" />} title={`${totals.duplicates} possible duplicate${totals.duplicates > 1 ? "s" : ""} left unticked`}>Nothing is deleted. Tick any that are genuinely new payments.</InlineAlert>}
        {totals.transfers > 0 && <InlineAlert tone="info" icon={<ArrowLeftRight className="size-4" />} title={`${totals.transfers} row${totals.transfers > 1 ? "s look" : " looks"} like a transfer between your own accounts`}>These are unticked so they don't count as spending or income. Record them as transfers instead if you like.</InlineAlert>}
      </Card>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Filter rows">
        {chips.filter(([k, , n]) => k === "all" || n > 0).map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setLimit(PAGE); }}
            className={cn("h-9 shrink-0 rounded-full px-3.5 text-xs font-semibold transition-colors", filter === k ? "bg-plum text-on-brand" : "bg-card text-muted-foreground shadow-card")}>
            {label} · {n}
          </button>
        ))}
      </div>

      {filter === "invalid" ? (
        <Card className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">These rows can't be imported. They're counted as rejected in your import history. Fix them in the file and import it again — rows already saved will be flagged as duplicates.</p>
          <ul className="space-y-2">
            {invalid.slice(0, limit).map((r) => (
              <li key={r.row} className="rounded-2xl bg-destructive/5 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-destructive"><CircleAlert className="size-4" />Row {r.row}: {r.reason}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{Object.values(r.raw).filter(Boolean).join(" · ")}</p>
              </li>
            ))}
          </ul>
          {invalid.length > limit && <Button variant="soft" className="w-full" onClick={() => setLimit(limit + PAGE)}>Show more</Button>}
        </Card>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No rows in this view.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end gap-3 text-xs font-semibold">
            <button className="text-coral" onClick={() => setAll(true)}>Tick all shown</button>
            <button className="text-muted-foreground" onClick={() => setAll(false)}>Untick all shown</button>
          </div>
          {shown.slice(0, limit).map((r) => <RowCard key={r.row} r={r} onToggle={(v) => update(r.row, (x) => ({ ...x, include: v }))} onType={(t) => update(r.row, (x) => withType(x, t))} onCategory={(c) => update(r.row, (x) => ({ ...x, category: c || null }))} />)}
          {shown.length > limit && <Button variant="soft" className="w-full" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more of {shown.length - limit}</Button>}
        </div>
      )}

      <div className="sticky bottom-24 z-10 flex gap-3 rounded-full bg-background/90 p-1 backdrop-blur">
        <Button variant="soft" size="lg" className="flex-1" onClick={onBack} disabled={saving}>Back</Button>
        <Button size="lg" className="flex-[2]" disabled={totals.selected === 0 || saving} onClick={() => setConfirm(true)}>
          {saving && <Loader2 className="animate-spin" />}{totals.selected ? `Import ${totals.selected.toLocaleString("en-IN")} transaction${totals.selected > 1 ? "s" : ""}` : "Select rows to import"}
        </Button>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Save {totals.selected.toLocaleString("en-IN")} transactions?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p>From <span className="font-semibold text-foreground">{fileName}</span> into <span className="font-semibold text-foreground">{sourceName}</span>.</p>
                <p>Income {formatMoney(totals.incomePaise)} · Expenses {formatMoney(totals.expensePaise)}</p>
                {totals.valid - totals.selected > 0 && <p>{totals.valid - totals.selected} unticked row{totals.valid - totals.selected > 1 ? "s" : ""} will be skipped.</p>}
                {totals.invalid > 0 && <p>{totals.invalid} invalid row{totals.invalid > 1 ? "s" : ""} will be recorded as rejected.</p>}
                <p>Existing transactions are never changed.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Keep reviewing</AlertDialogCancel>
            <AlertDialogAction className="rounded-full" onClick={onSave}>Save import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string | undefined }) {
  return (
    <div className={cn("rounded-2xl bg-muted p-3", tone)}>
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className="num truncate text-base font-extrabold">{value}</p>
    </div>
  );
}

const TYPE_LABEL: Record<ImportTxnType, string> = { expense: "Expense", income: "Income", refund: "Refund" };

function RowCard({ r, onToggle, onType, onCategory }: { r: ReviewRow; onToggle: (v: boolean) => void; onType: (t: ImportTxnType) => void; onCategory: (c: string) => void }) {
  const cats = r.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const positive = r.type !== "expense";
  const field = "h-9 min-w-0 rounded-xl border border-input bg-card px-2 text-xs";
  return (
    <div className={cn("rounded-3xl border bg-card p-3.5 shadow-card transition-opacity", r.include ? "border-border/70" : "border-dashed border-border opacity-70")}>
      <div className="flex items-start gap-3">
        <Checkbox checked={r.include} onCheckedChange={(v) => onToggle(v === true)} aria-label={`Import row ${r.row}`} className="mt-1 size-5 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.merchant ?? r.description}</p>
              <p className="truncate text-xs text-muted-foreground">{r.date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}{r.merchant ? ` · ${r.description}` : ""}</p>
            </div>
            <p className={cn("num shrink-0 font-bold", positive ? "text-income" : "text-expense")}>{positive ? "+" : "−"}{formatMoney(r.amountPaise)}</p>
          </div>
          {(r.dup || r.possibleTransfer) && (
            <p className={cn("mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", r.dup ? "bg-saffron/25 text-plum" : "bg-lavender text-transfer")}>
              {r.dup ? DUP_LABELS[r.dup] : "Possible transfer between your own accounts"}
            </p>
          )}
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
            <select aria-label="Type" value={r.type} onChange={(e) => onType(e.target.value as ImportTxnType)} className={field}>
              {(Object.keys(TYPE_LABEL) as ImportTxnType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <select aria-label="Category" value={r.category ?? ""} onChange={(e) => onCategory(e.target.value)} className={cn(field, !r.category && "text-muted-foreground")}>
              <option value="">Uncategorised</option>
              {cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
