import { Link } from "@tanstack/react-router";
import { ChevronRight, CircleDashed, Gauge } from "lucide-react";
import { formatMoney } from "@/lib/finance/money";
import { Money } from "@/components/smartfin/money";
import { Card } from "@/components/smartfin/ui-bits";
import { describeChange, monthKey, monthName, type MonthlyReport, type Metric, type Pace } from "@/lib/finance/monthly";
import { ChangeChip } from "./change-chip";

/** Current vs previous month: income, expenses and net cash flow with plain-language changes. */
export function MonthlySummary({ report, title, linkToReport, showUncategorised }: { report: MonthlyReport; title: string; linkToReport?: boolean; showUncategorised?: boolean }) {
  const cur = monthName(report.current), prev = monthName(report.previous);
  const pace = report.pace;
  const rows: [string, Metric, string][] = [
    ["Income", report.income, describeChange("Income", report.income, { amount: true })],
    ["Expenses", report.expenses, report.expenses.direction === "new" ? "No previous-month spending to compare." : describeChange("Expenses", report.expenses)],
    ["Net cash flow", report.net, report.net.direction === "none" ? "Nothing recorded in either month." : `${formatNetChange(report.net)}`],
  ];
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{cur} vs {prev} · recorded transactions</p>
          {pace && <p className="text-xs text-muted-foreground">{cur} is in progress — day {pace.day} of {pace.days}.</p>}
        </div>
        {linkToReport && <Link to="/compare" className="flex shrink-0 items-center text-sm font-semibold text-coral">Report<ChevronRight className="size-4" /></Link>}
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] items-end gap-x-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span />
        <span className="w-20 text-right">{cur.slice(0, 3)}</span>
        <span className="w-20 text-right">{prev.slice(0, 3)}</span>
      </div>
      <ul className="-mt-2 space-y-3">
        {rows.map(([label, m, sentence]) => (
          <li key={label} className="space-y-1">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 text-sm">
              <span className="font-semibold">{label}</span>
              <span className="w-20 text-right font-bold"><Money paise={m.current} decimals="never" signed={label === "Net cash flow"} /></span>
              <span className="w-20 text-right text-muted-foreground"><Money paise={m.previous} decimals="never" signed={label === "Net cash flow"} /></span>
            </div>
            <div className="flex items-center gap-2">
              <ChangeChip m={m} show={label === "Expenses" ? "pct" : "amount"} />
              <p className="text-xs text-muted-foreground">{sentence}</p>
            </div>
          </li>
        ))}
      </ul>
      {pace && <PaceNote pace={pace} cur={cur} prev={prev} />}
      {showUncategorised && report.uncategorised.count > 0 && (
        <Link to="/transactions" search={{ category: "uncategorised", month: monthKey(report.current) }} className="flex items-center gap-3 rounded-2xl bg-muted p-3 text-sm transition-colors hover:bg-muted/70">
          <CircleDashed className="size-4 shrink-0 text-plum" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{report.uncategorised.count} uncategorised · {formatMoney(report.uncategorised.paise, { decimals: "never" })}</span>
            <span className="block text-xs text-muted-foreground">Still counted in your expenses. Tap to assign categories.</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}
    </Card>
  );
}

/** Fair comparison for a month that isn't over: first N days vs the first N days of the compared month. */
function PaceNote({ pace, cur, prev }: { pace: Pace; cur: string; prev: string }) {
  const m = pace.expenses;
  const prevSpan = pace.previousDay < pace.day ? `all of ${prev} (${pace.previousDays} days)` : `by ${pace.previousDay} ${prev}`;
  const sentence = m.direction === "none" ? `No spending in the first ${pace.day} days of either month.`
    : m.direction === "new" ? `Nothing was spent ${prevSpan}.`
    : m.direction === "flat" ? `About the same as ${prevSpan}.`
    : `${m.delta > 0 ? "More" : "Less"} than the ${formatMoney(m.previous, { decimals: "never" })} spent ${prevSpan}.`;
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-lavender p-3">
      <Gauge className="mt-0.5 size-4 shrink-0 text-transfer" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Same days compared</p>
        <p className="text-xs text-muted-foreground">
          <span className="num font-semibold text-foreground">{formatMoney(m.current, { decimals: "never" })}</span> spent up to {pace.day} {cur}. {sentence}
        </p>
      </div>
      <ChangeChip m={m} />
    </div>
  );
}

function formatNetChange(m: Metric) {
  if (m.direction === "flat") return "Net cash flow remained almost the same.";
  if (m.delta === 0) return "No change in net cash flow.";
  return `Net cash flow is ${m.delta > 0 ? "higher" : "lower"} than last month.`;
}
