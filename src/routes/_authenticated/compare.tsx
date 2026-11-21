import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { CalendarRange, CircleDashed, Copy, FileUp, Lightbulb, Repeat, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorNote, InlineAlert, NativeSelect, PageHeader, SectionTitle, SkeletonBlock } from "@/components/smartfin/ui-bits";
import { TrendChart } from "@/components/smartfin/trend-chart";
import { MonthlySummary } from "@/components/smartfin/monthly/monthly-summary";
import { CategoryCompare } from "@/components/smartfin/monthly/category-compare";
import { MonthBars } from "@/components/smartfin/monthly/month-bars";
import { ChangeChip } from "@/components/smartfin/monthly/change-chip";
import { useFinanceData } from "@/hooks/use-finance-data";
import { errorMessage } from "@/lib/data/queries";
import { getCategory } from "@/lib/finance/categories";
import { trend } from "@/lib/finance/engine";
import { formatMoney } from "@/lib/finance/money";
import { availableMonths, compareMonths, detectRecurring, monthKey, monthLabel, monthName, monthOf, monthRange, parseMonthKey, shiftMonth } from "@/lib/finance/monthly";

const monthParam = z.string().regex(/^\d{4}-\d{2}$/).optional().catch(undefined);

export const Route = createFileRoute("/_authenticated/compare")({
  validateSearch: z.object({ a: monthParam, b: monthParam }),
  head: () => ({ meta: [{ title: "Monthly report — SMARTFIN" }, { name: "description", content: "Compare this month with last month: income, spending, categories, merchants and recurring payments." }] }),
  component: ComparePage,
});

const FREQ_LABEL = { weekly: "Weekly", monthly: "Monthly", quarterly: "Every 3 months", yearly: "Yearly" } as const;

function ComparePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/compare" });
  const { txns, isLoading, error, refetch } = useFinanceData();

  const a = (search.a && parseMonthKey(search.a)) || monthOf(new Date());
  const b = (search.b && parseMonthKey(search.b)) || shiftMonth(a, -1);
  const months = useMemo(() => availableMonths(txns), [txns]);
  const monthOptions = months.map((m) => [monthKey(m), monthLabel(m)] as const);
  if (!months.some((m) => monthKey(m) === monthKey(b))) monthOptions.push([monthKey(b), monthLabel(b)]);

  const view = useMemo(() => {
    const report = compareMonths(txns, a, b);
    const recurring = detectRecurring(txns).slice(0, 8);
    const trendRange = { start: monthRange(shiftMonth(a, -5)).start, end: monthRange(a).end };
    return { report, recurring, trendPoints: trend(txns, trendRange) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns, monthKey(a), monthKey(b)]);
  const { report } = view;
  const cur = monthName(a), prev = monthName(b);
  const sameYear = a.year === b.year;
  const curLabel = sameYear ? cur : monthLabel(a, "short"), prevLabel = sameYear ? prev : monthLabel(b, "short");
  const topMerchants = report.merchants.filter((m) => m.count > 0).slice(0, 6);

  const setA = (k: string) => navigate({ search: { a: k } });
  const setB = (k: string) => navigate({ search: { a: monthKey(a), b: k } });

  return (
    <div className="space-y-5">
      <PageHeader title="Monthly report" subtitle={`${monthLabel(a)} vs ${monthLabel(b)}`} back="/analytics" />

      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">Month
            <NativeSelect label="Month" value={monthKey(a)} onChange={setA} options={monthOptions} className="text-foreground" />
          </label>
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">Compare with
            <NativeSelect label="Compare with" value={monthKey(b)} onChange={setB} options={monthOptions.filter(([k]) => k !== monthKey(a))} className="text-foreground" />
          </label>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={!search.a ? "default" : "soft"} onClick={() => navigate({ search: {} })}>This month</Button>
          <Button size="sm" variant="soft" onClick={() => setA(monthKey(shiftMonth(monthOf(new Date()), -1)))}>Last month</Button>
        </div>
      </Card>

      {error ? <ErrorNote message={errorMessage(error)} onRetry={refetch} /> : isLoading ? (
        <div className="space-y-4"><SkeletonBlock className="h-64" /><SkeletonBlock className="h-64" /></div>
      ) : txns.length === 0 ? (
        <EmptyState icon={<CalendarRange className="size-7" />} title="No transactions yet" body="Add or import transactions to compare your months."
          action={<Button asChild><Link to="/import"><FileUp />Import CSV</Link></Button>} />
      ) : (
        <>
          {!report.enoughHistory && (
            <InlineAlert tone="info" title="More transaction history is needed">
              {report.currentSummary.count === 0 ? `There are no recorded transactions in ${monthLabel(a)}.` : `There are no recorded transactions in ${monthLabel(b)} to compare with.`} Import an older statement or add past transactions for a full comparison.
            </InlineAlert>
          )}

          <MonthlySummary report={report} title="Current vs previous" />

          <Card><SectionTitle title="Income vs expenses" /><MonthBars income={[report.income.current, report.income.previous]} expenses={[report.expenses.current, report.expenses.previous]} curLabel={curLabel} prevLabel={prevLabel} /></Card>

          <Card>
            <SectionTitle title="Smart insights" />
            {report.insights.length ? (
              <ul className="space-y-2">
                {report.insights.map((i) => (
                  <li key={i.id} className="flex gap-3 rounded-2xl bg-lavender p-3 text-sm"><Lightbulb className="mt-0.5 size-4 shrink-0 text-transfer" /><span className="font-medium leading-snug">{i.text}</span></li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Insights appear when both months have recorded transactions. More history is needed.</p>}
          </Card>

          {report.uncategorised.count > 0 && (
            <Card className="flex items-center gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-muted text-plum"><CircleDashed className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{report.uncategorised.count} uncategorised transaction{report.uncategorised.count > 1 ? "s" : ""}</p>
                <p className="text-xs text-muted-foreground">{formatMoney(report.uncategorised.paise, { decimals: "never" })} in {cur} · still counted in your expenses</p>
              </div>
              <Button asChild size="sm" variant="soft"><Link to="/transactions" search={{ category: "uncategorised", month: monthKey(a) }}>Assign</Link></Button>
            </Card>
          )}

          {report.duplicates.length > 0 && (
            <Card className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-saffron/25 text-plum"><Copy className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{report.duplicates.length === 1 ? "1 payment may be recorded twice" : `${report.duplicates.length} payments may be recorded twice`}</p>
                  <p className="text-xs text-muted-foreground">They're still counted in these totals. Open them and delete the extra copy if it's the same payment.</p>
                </div>
              </div>
              <ul className="space-y-2">
                {report.duplicates.slice(0, 5).map((g) => (
                  <li key={g.key} className="rounded-2xl bg-muted p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{g.name}</span>
                      <span className="num shrink-0 font-bold">{formatMoney(g.amountPaise, { decimals: "never" })} × {g.ids.length}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{g.reason === "reference" ? "Same reference number" : `Same amount on ${new Date(g.occurredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {g.ids.map((id, i) => <Link key={id} to="/transactions/$id" params={{ id }} className="text-xs font-semibold text-coral">Open copy {i + 1}</Link>)}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <SectionTitle title="Spending by category" />
            {report.categories.length ? (
              <>
                {(report.biggestIncrease || report.biggestDecrease) && (
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    {report.biggestIncrease && <Highlight label="Largest increase" name={report.biggestIncrease.label} value={formatMoney(report.biggestIncrease.delta, { decimals: "never", signed: true })} />}
                    {report.biggestDecrease && <Highlight label="Largest decrease" name={report.biggestDecrease.label} value={formatMoney(report.biggestDecrease.delta, { decimals: "never", signed: true })} />}
                  </div>
                )}
                <CategoryCompare items={report.categories} curLabel={curLabel} prevLabel={prevLabel} month={monthKey(a)} />
              </>
            ) : <p className="py-4 text-center text-sm text-muted-foreground">No spending recorded in these months.</p>}
          </Card>

          <Card>
            <SectionTitle title="Most frequent merchants" />
            {topMerchants.length ? (
              <ul className="space-y-2.5">
                {topMerchants.map((m) => (
                  <li key={m.key} className="flex items-center gap-3 text-sm">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet/15 text-transfer"><Store className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.count} payment{m.count > 1 ? "s" : ""} in {cur} · {m.previousCount} in {prev}</p>
                    </div>
                    <div className="text-right">
                      <p className="num font-bold">{formatMoney(m.spent.current, { decimals: "never" })}</p>
                      <ChangeChip m={m.spent} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No merchant payments recorded in {cur}.</p>}
          </Card>

          <Card>
            <SectionTitle title="Possible recurring payments" />
            <p className="-mt-2 mb-3 text-xs text-muted-foreground">Estimated from your transaction history. These are not confirmed subscriptions.</p>
            {view.recurring.length ? (
              <ul className="divide-y divide-border">
                {view.recurring.map((r) => (
                  <li key={r.key} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-plum"><Repeat className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-semibold">{r.name}<span className="rounded-full bg-saffron/25 px-1.5 py-0.5 text-[10px] font-bold uppercase text-plum">{r.confidence === "likely" ? "Likely" : "Possible"}</span></p>
                      <p className="text-xs text-muted-foreground">
                        {r.frequency ? FREQ_LABEL[r.frequency] : `Seen ${r.occurrences} times — more history needed to confirm how often`} · {getCategory(r.category).label} · last on {new Date(r.lastPaidAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <p className="num shrink-0 text-right font-bold">{r.amountVaries ? "~" : ""}{formatMoney(r.typicalPaise, { decimals: "never" })}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No regular payments found yet. They show up after at least two similar payments to the same merchant at a regular interval.</p>}
          </Card>

          <Card>
            <SectionTitle title="Last 6 months" />
            <TrendChart points={view.trendPoints} />
          </Card>

          <p className="px-1 text-xs text-muted-foreground">Calendar months in your local time. Only confirmed records count: transfers between your own sources are excluded, refunds reduce spending, and pending or failed payments are left out. Includes manually entered, CSV-imported and scanned transactions.{report.demoCount > 0 && ` ${report.demoCount} demo record${report.demoCount > 1 ? "s are" : " is"} included in these months.`}</p>
        </>
      )}
    </div>
  );
}

function Highlight({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted p-3">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-bold">{name}</p>
      <p className="num text-xs font-semibold text-transfer">{value}</p>
    </div>
  );
}
