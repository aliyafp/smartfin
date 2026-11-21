import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { BarChart3, CalendarRange, ChevronRight } from "lucide-react";
import { Card, EmptyState, ErrorNote, PageHeader, SectionTitle, SkeletonBlock } from "@/components/smartfin/ui-bits";
import { CategoryChart } from "@/components/smartfin/category-chart";
import { TrendChart } from "@/components/smartfin/trend-chart";
import { PeriodPicker, describeRange, usePeriod } from "@/components/smartfin/period-picker";
import { Money } from "@/components/smartfin/money";
import { useFinanceData } from "@/hooks/use-finance-data";
import { errorMessage } from "@/lib/data/queries";
import { categoryBreakdown, inRange, summarize, trend } from "@/lib/finance/engine";
import { formatMoney } from "@/lib/finance/money";
import { merchantName } from "@/lib/finance/monthly";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — SMARTFIN" }] }),
  component: Analytics,
});

function Analytics() {
  const { txns, isLoading, error, refetch } = useFinanceData();
  const period = usePeriod("month");
  const v = useMemo(() => {
    const cur = inRange(txns, period.range);
    const merchants = new Map<string, number>();
    for (const t of cur) {
      if (t.txn_type !== "expense" && t.txn_type !== "refund") continue;
      const k = merchantName(t);
      merchants.set(k, (merchants.get(k) ?? 0) + (t.txn_type === "expense" ? t.amount_paise : -t.amount_paise));
    }
    return { s: summarize(cur), slices: categoryBreakdown(cur), points: trend(cur, period.range), merchants: [...merchants].filter(([, a]) => a > 0).sort((a, b) => b[1] - a[1]).slice(0, 5) };
  }, [txns, period.range]);

  return (
    <div className="space-y-5">
      <PageHeader title="Analytics" subtitle={describeRange(period.range)} />
      <Link to="/compare" className="flex items-center gap-3 rounded-3xl bg-brand-gradient p-4 text-on-brand shadow-brand transition-transform active:scale-[0.98]">
        <span className="grid size-10 place-items-center rounded-2xl bg-card/20"><CalendarRange className="size-5" /></span>
        <span className="flex-1"><span className="block font-bold">Monthly report</span><span className="block text-xs opacity-90">This month vs last month, categories, merchants, recurring payments</span></span>
        <ChevronRight className="size-5" />
      </Link>
      <PeriodPicker period={period} />
      {error ? <ErrorNote message={errorMessage(error)} onRetry={refetch} /> : isLoading ? <SkeletonBlock className="h-80" /> : v.s.count === 0 ? (
        <EmptyState icon={<BarChart3 className="size-7" />} title="Nothing to analyse yet" body="There are no recorded transactions in this period." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[["Income", v.s.incomePaise, "bg-turquoise/15"], ["Spent", v.s.expensePaise, "bg-coral/12"], ["Net", v.s.netPaise, "bg-lavender"]].map(([l, p, c]) => (
              <div key={l as string} className={`rounded-2xl p-3 ${c}`}><p className="text-xs font-semibold text-muted-foreground">{l}</p><p className="num text-sm font-extrabold"><Money paise={p as number} decimals="never" /></p></div>
            ))}
          </div>
          {v.s.refundPaise > 0 && <p className="text-xs text-muted-foreground">Spending is shown after {formatMoney(v.s.refundPaise)} in refunds. Transfers of {formatMoney(v.s.transferPaise)} are excluded.</p>}
          <Card><SectionTitle title="Income vs expenses" /><TrendChart points={v.points} /></Card>
          <Card><SectionTitle title="Category breakdown" />{v.slices.length ? <CategoryChart slices={v.slices} totalPaise={v.s.expensePaise} /> : <p className="py-4 text-center text-sm text-muted-foreground">No spending in this period.</p>}</Card>
          {v.merchants.length > 0 && (
            <Card>
              <SectionTitle title="Top merchants" />
              <ul className="space-y-2">
                {v.merchants.map(([m, a], i) => (
                  <li key={m} className="flex items-center gap-3 text-sm"><span className="grid size-7 place-items-center rounded-full bg-violet/20 text-xs font-bold text-transfer">{i + 1}</span><span className="flex-1 truncate font-semibold">{m}</span><span className="num font-bold">{formatMoney(a)}</span></li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
