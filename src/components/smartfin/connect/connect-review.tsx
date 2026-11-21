import { useMemo, useState } from "react";
import { CircleAlert, Copy, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, InlineAlert, SectionTitle } from "@/components/smartfin/ui-bits";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/finance/categories";
import { formatMoney } from "@/lib/finance/money";
import { needsAttention, reviewCounts, type ConnectReview, type ReviewRow } from "@/lib/connect/engine/review";
import type { ExistingForMatch } from "@/lib/connect/engine/match";
import { cn } from "@/lib/utils";

type Filter = "all" | "add" | "link" | "not_counted" | "attention" | "rejected";
const PAGE = 40;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export function ConnectReviewStep({ review, setRows, existing, providerName, fileName, saving, onCancel, onSave }: {
  review: ConnectReview; setRows: (rows: ReviewRow[]) => void; existing: Map<string, ExistingForMatch>;
  providerName: string; fileName: string; saving: boolean; onCancel: () => void; onSave: () => void;
}) {
  const rows = review.rows;
  const c = useMemo(() => reviewCounts(review), [review]);
  const [filter, setFilter] = useState<Filter>(c.review ? "attention" : "all");
  const [limit, setLimit] = useState(PAGE);
  const [confirm, setConfirm] = useState(false);
  const selected = c.create + c.link + c.recordOnly;

  const shown = useMemo(() => rows.filter((r) => {
    switch (filter) {
      case "add": return r.include && r.action === "create";
      case "link": return r.include && r.action === "link";
      case "not_counted": return r.interp.effect === "not_counted";
      case "attention": return needsAttention(r);
      default: return true;
    }
  }), [rows, filter]);

  const update = (key: string, patch: Partial<ReviewRow>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setAll = (include: boolean) => { const ids = new Set(shown.map((r) => r.key)); setRows(rows.map((r) => (ids.has(r.key) ? { ...r, include } : r))); };

  const chips: [Filter, string, number][] = [
    ["all", "All", rows.length], ["attention", "Needs a look", c.review], ["add", "Will be added", c.create], ["link", "Already recorded", c.link],
    ["not_counted", "Not counted", rows.filter((r) => r.interp.effect === "not_counted").length], ["rejected", "Couldn't read", c.rejected],
  ];

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <SectionTitle title={`From ${providerName}`} />
        <p className="-mt-2 truncate text-xs text-muted-foreground">{fileName} · {review.parse.format}</p>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Found in file" value={c.received.toLocaleString("en-IN")} />
          <Stat label="New to add" value={c.create.toLocaleString("en-IN")} tone="bg-turquoise/15" />
          <Stat label="Spending to add" value={formatMoney(c.expensePaise)} tone="bg-coral/10" />
          <Stat label="Money in to add" value={formatMoney(c.incomePaise)} tone="bg-turquoise/15" />
          <Stat label="Already recorded" value={(c.link + c.duplicates).toLocaleString("en-IN")} tone={c.link + c.duplicates ? "bg-lavender" : undefined} />
          <Stat label="Not counted" value={c.recordOnly.toLocaleString("en-IN")} />
        </div>
        {c.refundPaise > 0 && <p className="text-xs text-muted-foreground">Includes {formatMoney(c.refundPaise)} in refunds. Refunds lower your spending and are never counted as income.</p>}
        {c.duplicates > 0 && <InlineAlert tone="info" icon={<Copy className="size-4" />} title={`${c.duplicates} row${c.duplicates > 1 ? "s were" : " was"} already imported`}>These are skipped so nothing is counted twice.</InlineAlert>}
        {c.link > 0 && <InlineAlert tone="info" icon={<Link2 className="size-4" />} title={`${c.link} payment${c.link > 1 ? "s are" : " is"} already in SMARTFIN`}>They'll be linked to the existing record instead of being added again.</InlineAlert>}
        {c.review > 0 && <InlineAlert tone="warning" icon={<CircleAlert className="size-4" />} title={`${c.review} row${c.review > 1 ? "s need" : " needs"} a look`}>These are unticked or might already be recorded. Tick the ones you want to add.</InlineAlert>}
      </Card>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Filter rows">
        {chips.filter(([k, , n]) => k === "all" || n > 0).map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setLimit(PAGE); }}
            className={cn("h-9 shrink-0 rounded-full px-3.5 text-xs font-semibold transition-colors", filter === k ? "bg-plum text-on-brand" : "bg-card text-muted-foreground shadow-card")}>
            {label} · {n}
          </button>
        ))}
      </div>

      {filter === "rejected" ? (
        <Card className="space-y-2 p-4">
          <p className="text-sm text-muted-foreground">These rows couldn't be used and are recorded as rejected in the import history.</p>
          {review.parse.rejected.slice(0, limit).map((r) => (
            <p key={r.row} className="flex items-center gap-1.5 rounded-2xl bg-destructive/5 p-3 text-sm font-semibold text-destructive"><CircleAlert className="size-4 shrink-0" />Row {r.row}: {r.reason}</p>
          ))}
        </Card>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing in this view.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end gap-3 text-xs font-semibold">
            <button className="text-coral" onClick={() => setAll(true)}>Tick all shown</button>
            <button className="text-muted-foreground" onClick={() => setAll(false)}>Untick all shown</button>
          </div>
          {shown.slice(0, limit).map((r) => <RowCard key={r.key} r={r} existing={r.match ? existing.get(r.match.txnId) : undefined} onChange={(p) => update(r.key, p)} />)}
          {shown.length > limit && <Button variant="soft" className="w-full" onClick={() => setLimit(limit + PAGE)}>Show more ({shown.length - limit} left)</Button>}
        </div>
      )}

      <div className="sticky bottom-24 z-10 flex gap-3 rounded-full bg-background/90 p-1 backdrop-blur">
        <Button variant="soft" size="lg" className="flex-1" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="lg" className="flex-[2]" disabled={selected === 0 || saving} onClick={() => setConfirm(true)}>
          {saving && <Loader2 className="animate-spin" />}{selected ? `Save ${selected.toLocaleString("en-IN")} record${selected > 1 ? "s" : ""}` : "Tick rows to save"}
        </Button>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Save from {providerName}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p><span className="font-semibold text-foreground">{c.create}</span> new transaction{c.create === 1 ? "" : "s"}: spending {formatMoney(c.expensePaise)}, money in {formatMoney(c.incomePaise)}.</p>
                {c.link > 0 && <p>{c.link} linked to records you already have.</p>}
                {c.recordOnly > 0 && <p>{c.recordOnly} kept for reference only (failed, pending, cancelled or transfers).</p>}
                {c.skipped > 0 && <p>{c.skipped} unticked row{c.skipped > 1 ? "s" : ""} will be skipped.</p>}
                <p>Your existing transactions are never changed.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Keep reviewing</AlertDialogCancel>
            <AlertDialogAction className="rounded-full" onClick={onSave}>Save</AlertDialogAction>
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

const EFFECT_TONE = { expense: "bg-coral/12 text-coral", income: "bg-turquoise/20 text-income", refund: "bg-turquoise/20 text-income", not_counted: "bg-muted text-muted-foreground" } as const;

function RowCard({ r, existing, onChange }: { r: ReviewRow; existing: ExistingForMatch | undefined; onChange: (p: Partial<ReviewRow>) => void }) {
  const x = r.record;
  const counted = r.interp.effect !== "not_counted";
  const positive = r.interp.effect === "income" || r.interp.effect === "refund";
  const cats = r.interp.txnType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return (
    <div className={cn("rounded-3xl border bg-card p-3.5 shadow-card transition-opacity", r.include ? "border-border/70" : "border-dashed border-border opacity-70")}>
      <div className="flex items-start gap-3">
        <Checkbox checked={r.include} onCheckedChange={(v) => onChange({ include: v === true })} aria-label={`Include ${r.merchant ?? x.description}`} className="mt-1 size-5 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{r.merchant ?? x.description}</p>
              <p className="truncate text-xs text-muted-foreground">{fmtDate(x.occurredAt)}{r.merchant && r.merchant !== x.description ? ` · ${x.description}` : ""}</p>
            </div>
            <p className={cn("num shrink-0 font-bold", !counted ? "text-muted-foreground line-through" : positive ? "text-income" : "text-expense")}>{positive ? "+" : "−"}{formatMoney(x.amountPaise)}</p>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", EFFECT_TONE[r.interp.effect])}>{r.interp.label}</span>
            {x.items.length > 0 && <span className="text-[11px] text-muted-foreground">{x.items.length} item{x.items.length > 1 ? "s" : ""}</span>}
            {x.paymentMethod && <span className="text-[11px] text-muted-foreground">{x.paymentMethod}</span>}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{r.interp.reason}</p>
          {r.match && existing && (
            <div className={cn("mt-2 rounded-2xl p-2.5 text-xs", r.match.strength === "strong" ? "bg-lavender" : "bg-saffron/20")}>
              <p className="font-semibold">{r.match.strength === "strong" ? "Already in SMARTFIN" : "Might already be in SMARTFIN"}: {existing.merchant ?? existing.description} · {formatMoney(existing.amount_paise)} · {fmtDate(existing.occurred_at)}</p>
              <p className="text-muted-foreground">{r.match.reasons.join(", ")}</p>
              <div className="mt-1.5 flex gap-2">
                <button onClick={() => onChange({ action: "link" })} aria-pressed={r.action === "link"} className={cn("rounded-full px-2.5 py-1 font-semibold", r.action === "link" ? "bg-plum text-on-brand" : "bg-card")}>Link to it</button>
                <button onClick={() => onChange({ action: "create" })} aria-pressed={r.action === "create"} className={cn("rounded-full px-2.5 py-1 font-semibold", r.action === "create" ? "bg-plum text-on-brand" : "bg-card")}>Add as new</button>
              </div>
            </div>
          )}
          {counted && r.action === "create" && (
            <select aria-label="Category" value={r.category ?? ""} onChange={(e) => onChange({ category: e.target.value || null })} className={cn("mt-2 h-9 w-full rounded-xl border border-input bg-card px-2 text-xs", !r.category && "text-muted-foreground")}>
              <option value="">Uncategorised</option>
              {cats.map((cat) => <option key={cat.key} value={cat.key}>{cat.label}</option>)}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
