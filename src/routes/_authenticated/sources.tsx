import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Banknote, CreditCard, Info, Landmark, Loader2, Plus, Smartphone, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, DemoBadge, EmptyState, ErrorNote, PageHeader, SkeletonBlock } from "@/components/smartfin/ui-bits";
import { useFinanceData } from "@/hooks/use-finance-data";
import { createSource, deleteSource, errorMessage, qk, type Source } from "@/lib/data/queries";
import { sourceBalances } from "@/lib/finance/engine";
import { formatMoney, parseAmountToPaise } from "@/lib/finance/money";
import { ACQUISITION_LABELS, SOURCE_TYPES, type SourceType } from "@/lib/finance/types";

export const Route = createFileRoute("/_authenticated/sources")({
  head: () => ({ meta: [{ title: "Financial sources — SMARTFIN" }] }),
  component: SourcesPage,
});

const ICON: Record<SourceType, typeof Landmark> = { bank: Landmark, gpay: Smartphone, phonepe: Smartphone, paytm: Smartphone, debit_card: CreditCard, credit_card: CreditCard, cash: Banknote, other: Wallet };

function SourcesPage() {
  const { sources, txns, isLoading, error, refetch } = useFinanceData();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const balances = useMemo(() => sourceBalances(sources, txns), [sources, txns]);
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const t of txns) for (const id of [t.source_id, t.to_source_id]) if (id) m.set(id, (m.get(id) ?? 0) + 1); return m; }, [txns]);

  const remove = async (s: Source) => {
    const n = counts.get(s.id) ?? 0;
    if (!window.confirm(n ? `Remove “${s.name}”? Its ${n} transaction(s) will stay but show no source.` : `Remove “${s.name}”?`)) return;
    try { await deleteSource(s.id); await qc.invalidateQueries(); toast.success("Source removed"); } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Financial sources" back="/profile" action={<Button size="icon" aria-label="Add source" onClick={() => setOpen(true)}><Plus /></Button>} />
      <div className="flex gap-3 rounded-2xl bg-lavender p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-transfer" />
        <p>Adding a source just helps you label where your records come from. SMARTFIN doesn't connect to banks or UPI apps, and it never asks for passwords, PINs or OTPs. <Link to="/import" className="font-semibold text-coral">Import a CSV statement</Link></p>
      </div>
      {error ? <ErrorNote message={errorMessage(error)} onRetry={refetch} /> : isLoading ? <SkeletonBlock className="h-40" /> : sources.length === 0 ? (
        <EmptyState icon={<Landmark className="size-7" />} title="No sources yet" body="Add your bank account, UPI apps, cards or cash wallet." action={<Button onClick={() => setOpen(true)}><Plus />Add source</Button>} />
      ) : (
        <div className="space-y-3">
          {sources.map((s) => {
            const Icon = ICON[s.source_type as SourceType] ?? Wallet;
            return (
              <Card key={s.id} className="flex items-center gap-3 p-4">
                <span className="grid size-11 place-items-center rounded-2xl bg-violet/20 text-transfer"><Icon className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-semibold">{s.name}{s.is_demo && <DemoBadge />}</p>
                  <p className="truncate text-xs text-muted-foreground">{SOURCE_TYPES[s.source_type as SourceType]}{s.masked_label ? ` · ${s.masked_label}` : ""} · {ACQUISITION_LABELS[s.acquisition_method as keyof typeof ACQUISITION_LABELS]}</p>
                  <p className="text-xs text-muted-foreground">{counts.get(s.id) ?? 0} transactions</p>
                </div>
                <div className="text-right">
                  <p className="num font-bold">{formatMoney(balances.get(s.id) ?? 0)}</p>
                  <p className="text-[10px] text-muted-foreground">recorded balance</p>
                </div>
                <button aria-label={`Remove ${s.name}`} onClick={() => remove(s)} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
              </Card>
            );
          })}
          <p className="px-1 text-xs text-muted-foreground">Recorded balance = opening balance + recorded income and refunds − recorded expenses ± transfers. It may differ from your actual bank balance.</p>
        </div>
      )}
      <AddSourceSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}

function AddSourceSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<SourceType>("bank");
  const [mask, setMask] = useState("");
  const [opening, setOpening] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const nm = name.trim();
    if (!nm || nm.length > 60) return setErr("Give it a name (up to 60 characters)");
    if (mask.trim().length > 12) return setErr("Masked label can be up to 12 characters, like ••4821");
    if (/\d{5,}/.test(mask)) return setErr("Only enter the last 4 digits, never the full account number");
    const neg = opening.trim().startsWith("-");
    const ob = opening.trim() ? parseAmountToPaise(opening.trim().replace(/^-/, "")) : 0;
    if (ob === null) return setErr("Opening balance should look like 25,000 or 1250.50");
    setErr(""); setBusy(true);
    try {
      await createSource({ name: nm, source_type: type, masked_label: mask.trim() || null, opening_balance_paise: neg ? -ob : ob, acquisition_method: "manual" });
      await qc.invalidateQueries({ queryKey: qk.sources });
      toast.success("Source added");
      setName(""); setMask(""); setOpening(""); onOpenChange(false);
    } catch (e2) { toast.error(errorMessage(e2)); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-3xl">
        <SheetHeader><SheetTitle>Add a source</SheetTitle></SheetHeader>
        <form onSubmit={submit} className="space-y-4 px-4 pb-6">
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(SOURCE_TYPES) as SourceType[]).map((t) => {
              const Icon = ICON[t];
              return (
                <button type="button" key={t} onClick={() => { setType(t); if (!name) setName(""); }} aria-pressed={type === t}
                  className={`flex flex-col items-center gap-1 rounded-2xl border p-2 text-[10px] font-semibold ${type === t ? "border-coral bg-coral/10 text-coral" : "border-border text-muted-foreground"}`}>
                  <Icon className="size-5" />{SOURCE_TYPES[t]}
                </button>
              );
            })}
          </div>
          <Input placeholder={`Name, e.g. ${SOURCE_TYPES[type]}`} value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-2xl" aria-label="Source name" />
          <Input placeholder="Last digits (optional), e.g. ••4821" value={mask} onChange={(e) => setMask(e.target.value)} className="h-12 rounded-2xl" aria-label="Masked label" />
          <Input inputMode="decimal" placeholder="Opening balance ₹ (optional)" value={opening} onChange={(e) => setOpening(e.target.value)} className="h-12 rounded-2xl" aria-label="Opening balance" />
          {err && <p className="text-sm font-medium text-destructive">{err}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Save source</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
