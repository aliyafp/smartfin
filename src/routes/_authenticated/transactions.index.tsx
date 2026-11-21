import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { FileUp, ListOrdered, Plus, ScanLine, Search, SlidersHorizontal, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { importsQuery } from "@/lib/data/imports";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorNote, PageHeader, SkeletonBlock } from "@/components/smartfin/ui-bits";
import { TxnRow } from "@/components/smartfin/txn-row";
import { useFinanceData } from "@/hooks/use-finance-data";
import { errorMessage } from "@/lib/data/queries";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategory } from "@/lib/finance/categories";
import { formatMoney, parseAmountToPaise } from "@/lib/finance/money";
import { TXN_TYPE_LABELS, type TxnType } from "@/lib/finance/types";
import { inRange } from "@/lib/finance/engine";
import { monthLabel, monthRange, parseMonthKey } from "@/lib/finance/monthly";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/transactions/")({
  validateSearch: z.object({ category: z.string().optional(), batch: z.string().optional(), month: z.string().regex(/^\d{4}-\d{2}$/).optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "Transactions — SMARTFIN" }] }),
  component: TxnList,
});

function TxnList() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { txns, sources, sourceMap, isLoading, error, refetch } = useFinanceData();
  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [type, setType] = useState<TxnType | "">("");
  const [sourceId, setSourceId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [entry, setEntry] = useState<"" | "manual" | "csv" | "receipt">("");
  const category = search.category ?? "";
  const batch = search.batch ?? "";
  const month = search.month ? parseMonthKey(search.month) : null;
  const imports = useQuery({ ...importsQuery, enabled: Boolean(batch) });
  const batchName = imports.data?.find((b) => b.id === batch)?.file_name;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const minP = min ? parseAmountToPaise(min) : null;
    const maxP = max ? parseAmountToPaise(max) : null;
    const fromT = from ? new Date(`${from}T00:00`).getTime() : null;
    const toT = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    return (month ? inRange(txns, monthRange(month)) : txns).filter((t) => {
      if (needle && ![t.description, t.merchant ?? "", getCategory(t.category).label, t.reference ?? "", t.notes ?? ""].some((s) => s.toLowerCase().includes(needle))) return false;
      if (type && t.txn_type !== type) return false;
      if (category && getCategory(t.category).key !== category) return false;
      if (category === "uncategorised" && t.txn_type === "transfer") return false;
      if (batch && t.import_batch_id !== batch) return false;
      if (entry === "csv" && t.entry_method !== "csv") return false;
      if (entry === "manual" && t.entry_method !== "manual") return false;
      if (entry === "receipt" && t.entry_method !== "receipt") return false;
      if (sourceId && t.source_id !== sourceId && t.to_source_id !== sourceId) return false;
      const x = new Date(t.occurred_at).getTime();
      if (fromT !== null && x < fromT) return false;
      if (toT !== null && x > toT) return false;
      if (minP !== null && t.amount_paise < minP) return false;
      if (maxP !== null && t.amount_paise > maxP) return false;
      return true;
    });
  }, [txns, q, type, category, batch, entry, sourceId, from, to, min, max, search.month]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const t of filtered) {
      const k = new Date(t.occurred_at).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()];
  }, [filtered]);

  const activeCount = [type, category, entry, sourceId, from, to, min, max, search.month].filter(Boolean).length;
  const clear = () => { setType(""); setEntry(""); setSourceId(""); setFrom(""); setTo(""); setMin(""); setMax(""); navigate({ to: "/transactions", search: {} }); };
  const field = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm";

  return (
    <div className="space-y-4">
      <PageHeader title="Transactions" subtitle={`${txns.length} recorded`} action={<div className="flex gap-2"><Button asChild size="icon" variant="soft" aria-label="Scan & Extract"><Link to="/scan"><ScanLine /></Link></Button><Button asChild size="icon" variant="soft" aria-label="Import CSV"><Link to="/import"><FileUp /></Link></Button><Button asChild size="icon" aria-label="Add transaction"><Link to="/transactions/new"><Plus /></Link></Button></div>} />

      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant, category, reference" aria-label="Search transactions" className="h-11 w-full rounded-full border border-input bg-card pl-10 pr-4 text-sm shadow-card outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <Button variant={activeCount ? "default" : "outline"} size="icon" aria-label="Filters" onClick={() => setShowFilters((s) => !s)} className="relative">
          <SlidersHorizontal />
          {activeCount > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-plum text-[10px] text-on-brand">{activeCount}</span>}
        </Button>
      </div>

      {showFilters && (
        <Card className="space-y-3 p-4 animate-rise">
          <div className="flex flex-wrap gap-2">
            {(["", "income", "expense", "refund", "transfer"] as const).map((t) => (
              <button key={t || "all"} onClick={() => setType(t)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", type === t ? "bg-plum text-on-brand" : "bg-muted text-muted-foreground")}>
                {t ? TXN_TYPE_LABELS[t] : "All types"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {([["", "Any entry"], ["manual", "Entered manually"], ["csv", "Imported (CSV)"], ["receipt", "Scanned"]] as const).map(([v, l]) => (
              <button key={v || "any"} onClick={() => setEntry(v)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", entry === v ? "bg-plum text-on-brand" : "bg-muted text-muted-foreground")}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Category" value={category} onChange={(e) => navigate({ to: "/transactions", search: { ...search, category: e.target.value || undefined } })} className={field}>
              <option value="">All categories</option>
              <option value="uncategorised">Uncategorised</option>
              {[...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <select aria-label="Source" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={field}>
              <option value="">All sources</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
            <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
            <input inputMode="decimal" placeholder="Min ₹" aria-label="Minimum amount" value={min} onChange={(e) => setMin(e.target.value)} className={field} />
            <input inputMode="decimal" placeholder="Max ₹" aria-label="Maximum amount" value={max} onChange={(e) => setMax(e.target.value)} className={field} />
          </div>
          {activeCount > 0 && <button onClick={clear} className="flex items-center gap-1 text-sm font-semibold text-coral"><X className="size-4" />Clear filters</button>}
        </Card>
      )}

      {((category && !showFilters) || batch || month) && (
        <div className="flex flex-wrap gap-2">
          {category && !showFilters && (
            <button onClick={() => navigate({ to: "/transactions", search: { ...search, category: undefined } })} className="inline-flex items-center gap-1.5 rounded-full bg-coral/10 px-3 py-1.5 text-xs font-semibold text-coral">
              {getCategory(category).label}<X className="size-3.5" />
            </button>
          )}
          {month && (
            <button onClick={() => navigate({ to: "/transactions", search: { ...search, month: undefined } })} className="inline-flex items-center gap-1.5 rounded-full bg-turquoise/20 px-3 py-1.5 text-xs font-semibold text-income">
              {monthLabel(month)}<X className="size-3.5" />
            </button>
          )}
          {batch && (
            <button onClick={() => navigate({ to: "/transactions", search: { ...search, batch: undefined } })} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-violet/15 px-3 py-1.5 text-xs font-semibold text-transfer">
              <span className="truncate">Import: {batchName ?? "file"}</span><X className="size-3.5 shrink-0" />
            </button>
          )}
        </div>
      )}
      {category === "uncategorised" && <p className="text-xs text-muted-foreground">Open a transaction and tap Edit to give it a category. Uncategorised spending is still included in your totals.</p>}

      {error ? <ErrorNote message={errorMessage(error)} onRetry={refetch} /> : isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-16" />)}</div>
      ) : txns.length === 0 ? (
        <EmptyState icon={<ListOrdered className="size-7" />} title="No transactions yet" body="Record your first income or expense to start building your financial picture."
          action={<div className="flex flex-col gap-2 sm:flex-row"><Button asChild><Link to="/transactions/new"><Plus />Add transaction</Link></Button><Button asChild variant="soft"><Link to="/import"><FileUp />Import CSV</Link></Button></div>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search className="size-7" />} title="No matches" body="Try a different search or clear your filters." action={<Button variant="soft" onClick={() => { setQ(""); clear(); }}>Reset</Button>} />
      ) : (
        <div className="space-y-4">
          {groups.map(([day, items]) => (
            <Card key={day} className="p-3">
              <p className="px-1 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{day}</p>
              {items.map((t) => <TxnRow key={t.id} txn={t} sources={sourceMap} />)}
            </Card>
          ))}
          <p className="text-center text-xs text-muted-foreground">Showing {filtered.length} of {txns.length} · Net {formatMoney(filtered.reduce((s, t) => s + (t.txn_type === "income" || t.txn_type === "refund" ? t.amount_paise : t.txn_type === "expense" ? -t.amount_paise : 0), 0), { signed: true })}</p>
        </div>
      )}
    </div>
  );
}
