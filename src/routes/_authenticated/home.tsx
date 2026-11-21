import type React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Database, FileUp, Landmark, Lightbulb, Loader2, Plus, Sparkles } from "lucide-react";
import { MonthlySummary } from "@/components/smartfin/monthly/monthly-summary";
import { compareMonths, monthOf, shiftMonth } from "@/lib/finance/monthly";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorNote, SectionTitle, SkeletonBlock } from "@/components/smartfin/ui-bits";
import { CategoryChart } from "@/components/smartfin/category-chart";
import { TrendChart } from "@/components/smartfin/trend-chart";
import { PeriodPicker, describeRange, usePeriod } from "@/components/smartfin/period-picker";
import { TxnRow } from "@/components/smartfin/txn-row";
import { Money } from "@/components/smartfin/money";
import { useFinanceData } from "@/hooks/use-finance-data";
import { profileQuery, errorMessage } from "@/lib/data/queries";
import { loadDemoData } from "@/lib/data/demo";
import { categoryBreakdown, inRange, previousRange, sourceBalances, summarize, trend } from "@/lib/finance/engine";
import { buildInsights } from "@/lib/finance/insights";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — SMARTFIN" }, { name: "description", content: "Your SMARTFIN dashboard." }] }),
  component: HomePage,
});

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function HomePage() {
  const { txns, sources, sourceMap, isLoading, error, refetch } = useFinanceData();
  const profile = useQuery(profileQuery);
  const period = usePeriod("month");
  const qc = useQueryClient();
  const [loadingDemo, setLoadingDemo] = useState(false);

  const view = useMemo(() => {
    const current = inRange(txns, period.range);
    const prev = inRange(txns, previousRange(period.range, period.key));
    const summary = summarize(current);
    const balances = sourceBalances(sources, txns);
    const totalBalance = [...balances.values()].reduce((a, b) => a + b, 0);
    const thisMonth = monthOf(new Date());
    const monthly = compareMonths(txns, thisMonth, shiftMonth(thisMonth, -1));
    return { current, summary, slices: categoryBreakdown(current), points: trend(current, period.range), insights: buildInsights(current, prev), totalBalance, monthly };
  }, [txns, sources, period.range, period.key]);

  const usedSources = new Set(txns.flatMap((t) => [t.source_id, t.to_source_id]).filter(Boolean)).size;
  const name = profile.data?.display_name?.split(" ")[0];

  const startDemo = async () => {
    setLoadingDemo(true);
    try { await loadDemoData(); await qc.invalidateQueries(); toast.success("Demo records added. They're labelled “Demo” everywhere."); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setLoadingDemo(false); }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between pt-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{greeting()}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{name ? `${name} 👋` : "Welcome 👋"}</h1>
        </div>
        <Link to="/profile" aria-label="Profile" className="grid size-11 place-items-center rounded-full bg-brand-gradient text-lg font-extrabold text-on-brand shadow-brand">
          {(name?.[0] ?? "S").toUpperCase()}
        </Link>
      </header>

      <PeriodPicker period={period} />

      {error ? <ErrorNote message={errorMessage(error)} onRetry={refetch} /> : isLoading ? (
        <div className="space-y-4"><SkeletonBlock className="h-52 rounded-3xl" /><SkeletonBlock className="h-24" /><SkeletonBlock className="h-64" /></div>
      ) : txns.length === 0 ? (
        <EmptyState icon={<Sparkles className="size-7" />} title="Let's record your first transaction"
          body="Add an income or expense to see your dashboard come alive. Or explore with sample records that are clearly marked as demo."
          action={<div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild><Link to="/transactions/new"><Plus />Add transaction</Link></Button>
            <Button asChild variant="soft"><Link to="/import"><FileUp />Import CSV</Link></Button>
            <Button variant="ghost" onClick={startDemo} disabled={loadingDemo}>{loadingDemo && <Loader2 className="animate-spin" />}Try demo data</Button>
          </div>} />
      ) : (
        <>
          <section className="relative overflow-hidden rounded-[1.75rem] bg-brand-gradient p-5 text-on-brand shadow-brand animate-rise">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-card/15" />
            <div className="pointer-events-none absolute -bottom-16 -left-6 size-40 rounded-full bg-plum/10" />
            <p className="text-xs font-semibold uppercase tracking-wider opacity-90">Net cash flow · {describeRange(period.range)}</p>
            <p className="mt-1 text-4xl font-extrabold num"><Money paise={view.summary.netPaise} decimals="never" signed /></p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-card/20 p-3 backdrop-blur-sm">
                <p className="flex items-center gap-1 text-xs font-semibold opacity-90"><ArrowDownLeft className="size-3.5" />Income</p>
                <p className="mt-0.5 text-lg font-bold"><Money paise={view.summary.incomePaise} decimals="never" /></p>
              </div>
              <div className="rounded-2xl bg-card/20 p-3 backdrop-blur-sm">
                <p className="flex items-center gap-1 text-xs font-semibold opacity-90"><ArrowUpRight className="size-3.5" />Expenses</p>
                <p className="mt-0.5 text-lg font-bold"><Money paise={view.summary.expensePaise} decimals="never" /></p>
              </div>
            </div>
            {sources.length > 0 && (
              <p className="mt-4 text-xs opacity-90">Recorded balance across {sources.length} source{sources.length > 1 ? "s" : ""}: <span className="font-bold"><Money paise={view.totalBalance} decimals="never" /></span></p>
            )}
          </section>

          <div className="grid grid-cols-3 gap-2">
            <QuickAction to="/transactions/new" icon={<Plus className="size-5" />} label="Add" tone="bg-coral/15 text-coral" />
            <QuickAction to="/import" icon={<FileUp className="size-5" />} label="Import CSV" tone="bg-turquoise/20 text-income" />
            <QuickAction to="/sources" icon={<Landmark className="size-5" />} label="Sources" tone="bg-violet/20 text-transfer" />
          </div>

          <MonthlySummary report={view.monthly} title="Monthly Comparison – Current Month vs Previous Month" linkToReport showUncategorised />

          {view.insights.length > 0 && (
            <div>
              <SectionTitle title="Insights" />
              <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
                {view.insights.map((ins) => (
                  <div key={ins.id} className={cn("w-64 shrink-0 snap-start rounded-3xl p-4", ins.tone === "positive" ? "bg-turquoise/15" : ins.tone === "attention" ? "bg-saffron/25" : "bg-lavender")}>
                    <Lightbulb className="mb-2 size-5 text-plum" />
                    <p className="text-sm font-medium leading-snug">{ins.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Card>
            <SectionTitle title="Spending by category" />
            {view.slices.length ? <CategoryChart slices={view.slices} totalPaise={view.summary.expensePaise} /> : <p className="py-6 text-center text-sm text-muted-foreground">No spending recorded in this period.</p>}
          </Card>

          <Card>
            <SectionTitle title="Income vs expenses" />
            {view.summary.count ? <TrendChart points={view.points} /> : <p className="py-6 text-center text-sm text-muted-foreground">Nothing recorded in this period.</p>}
          </Card>

          <Card>
            <SectionTitle title="Recent transactions" action={<Link to="/transactions" className="text-sm font-semibold text-coral">See all</Link>} />
            <div className="-mx-1">{txns.slice(0, 5).map((t) => <TxnRow key={t.id} txn={t} sources={sourceMap} />)}</div>
          </Card>

          <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
            <Database className="mt-0.5 size-3.5 shrink-0" />
            Based on {view.summary.count} recorded transaction{view.summary.count === 1 ? "" : "s"} in this period, from {usedSources} source{usedSources === 1 ? "" : "s"}. Reports only include what you've recorded and may not reflect all your financial activity.
          </p>
        </>
      )}
    </div>
  );
}

function QuickAction({ to, icon, label, tone }: { to: "/transactions/new" | "/sources" | "/import"; icon: React.ReactNode; label: string; tone: string }) {
  return (
    <Link to={to} className="flex flex-col items-center gap-2 rounded-3xl bg-card p-3 text-center shadow-card transition-transform active:scale-[0.98]">
      <span className={cn("grid size-10 place-items-center rounded-2xl", tone)}>{icon}</span>
      <span className="text-sm font-bold leading-tight">{label}</span>
    </Link>
  );
}
