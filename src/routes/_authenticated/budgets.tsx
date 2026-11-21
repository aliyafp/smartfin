import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Info, Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  SectionTitle,
  SkeletonBlock,
} from "@/components/smartfin/ui-bits";
import { CategoryIcon } from "@/components/smartfin/category-icon";
import { Money } from "@/components/smartfin/money";
import { PlanTabs, ProgressBar, StatusChip, pctText } from "@/components/smartfin/plans/plan-bits";
import { BudgetSheet } from "@/components/smartfin/plans/budget-sheet";
import { useFinanceData } from "@/hooks/use-finance-data";
import { errorMessage } from "@/lib/data/queries";
import { budgetsQuery, deleteBudget, planKeys, type Budget } from "@/lib/data/plans";
import { getCategory } from "@/lib/finance/categories";
import { formatMoney } from "@/lib/finance/money";
import { monthKey, monthLabel, monthOf, parseMonthKey, shiftMonth } from "@/lib/finance/monthly";
import { budgetReport, monthCategorySpend, type BudgetStatus } from "@/lib/finance/plans";

export const Route = createFileRoute("/_authenticated/budgets")({
  validateSearch: z.object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional()
      .catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Budgets — SMARTFIN" },
      { name: "description", content: "Monthly category budgets and how much you have left." },
    ],
  }),
  component: BudgetsPage,
});

const STATUS_LABEL: Record<BudgetStatus, string> = {
  ok: "On track",
  near: "Close to limit",
  over: "Over budget",
};

function BudgetsPage() {
  const search = Route.useSearch();
  const current = monthOf(new Date());
  const month = (search.month && parseMonthKey(search.month)) || current;
  const isCurrent = monthKey(month) === monthKey(current);
  const budgets = useQuery(budgetsQuery);
  const { txns, isLoading, error, refetch } = useFinanceData();
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<{ open: boolean; editing: Budget | null }>({
    open: false,
    editing: null,
  });
  const [pending, setPending] = useState<Budget | null>(null);

  const report = useMemo(
    () => budgetReport(budgets.data ?? [], txns, month),
    [budgets.data, txns, month],
  );
  const unbudgeted = useMemo(() => {
    const used = new Set((budgets.data ?? []).map((b) => b.category));
    return [...monthCategorySpend(txns, month)]
      .filter(([k, v]) => v > 0 && !used.has(k))
      .sort((a, b) => b[1] - a[1]);
  }, [budgets.data, txns, month]);

  const loading = isLoading || budgets.isLoading;
  const loadError = error ?? budgets.error;
  const list = budgets.data ?? [];

  const remove = async () => {
    if (!pending) return;
    try {
      await deleteBudget(pending.id);
      await qc.invalidateQueries({ queryKey: planKeys.budgets });
      toast.success("Budget removed");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Budgets"
        subtitle="Monthly limits by category"
        action={
          list.length > 0 ? (
            <Button
              size="icon"
              aria-label="Add budget"
              onClick={() => setSheet({ open: true, editing: null })}
            >
              <Plus />
            </Button>
          ) : undefined
        }
      />
      <PlanTabs />

      <div className="flex items-center justify-between rounded-full bg-card p-1 shadow-card">
        <Button asChild variant="ghost" size="icon" aria-label="Previous month">
          <Link to="/budgets" search={{ month: monthKey(shiftMonth(month, -1)) }}>
            <ChevronLeft />
          </Link>
        </Button>
        <p className="text-sm font-bold">
          {monthLabel(month)}
          {isCurrent && (
            <span className="ml-1.5 text-xs font-semibold text-muted-foreground">· so far</span>
          )}
        </p>
        {isCurrent ? (
          <span className="size-11" aria-hidden />
        ) : (
          <Button asChild variant="ghost" size="icon" aria-label="Next month">
            <Link to="/budgets" search={{ month: monthKey(shiftMonth(month, 1)) }}>
              <ChevronRight />
            </Link>
          </Button>
        )}
      </div>

      {loadError ? (
        <ErrorNote
          message={errorMessage(loadError)}
          onRetry={() => {
            refetch();
            budgets.refetch();
          }}
        />
      ) : loading ? (
        <div className="space-y-3">
          <SkeletonBlock className="h-40 rounded-3xl" />
          <SkeletonBlock className="h-24" />
          <SkeletonBlock className="h-24" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<PiggyBank className="size-7" />}
          title="Set your first budget"
          body="Pick a category and a monthly limit. SMARTFIN tracks what you've spent from your recorded transactions and warns you at 80%."
          action={
            <Button onClick={() => setSheet({ open: true, editing: null })}>
              <Plus />
              Add budget
            </Button>
          }
        />
      ) : (
        <>
          <section className="relative overflow-hidden rounded-[1.75rem] bg-brand-gradient p-5 text-on-brand shadow-brand">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-card/15" />
            <p className="text-xs font-semibold uppercase tracking-wider opacity-90">
              {report.totalRemainingPaise >= 0 ? "Left to spend" : "Over budget by"} ·{" "}
              {monthLabel(month, "short")}
            </p>
            <p className="mt-1 text-4xl font-extrabold num">
              <Money paise={Math.abs(report.totalRemainingPaise)} decimals="never" />
            </p>
            <div
              className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-card/25"
              role="progressbar"
              aria-label="Total budget used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.round(report.usedBp / 100))}
            >
              <div
                className="h-full rounded-full bg-card"
                style={{ width: `${Math.min(100, report.usedBp / 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs opacity-90">
              Spent{" "}
              <span className="font-bold">
                {formatMoney(report.totalSpentPaise, { decimals: "never" })}
              </span>{" "}
              of {formatMoney(report.totalLimitPaise, { decimals: "never" })} (
              {pctText(report.usedBp)}) across {list.length} budget{list.length === 1 ? "" : "s"}
            </p>
            {(report.overCount > 0 || report.nearCount > 0) && (
              <p className="mt-1 text-xs font-semibold">
                {[
                  report.overCount && `${report.overCount} over budget`,
                  report.nearCount && `${report.nearCount} close to the limit`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </section>

          <div className="space-y-3">
            {report.lines.map((l) => {
              const cat = getCategory(l.category);
              const b = list.find((x) => x.id === l.id)!;
              return (
                <Card key={l.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <CategoryIcon category={l.category} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                        <span className="truncate">{cat.label}</span>
                        <StatusChip status={l.status}>{STATUS_LABEL[l.status]}</StatusChip>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="num font-semibold text-foreground">
                          {formatMoney(l.spentPaise)}
                        </span>{" "}
                        of {formatMoney(l.limitPaise)}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Edit ${cat.label} budget`}
                      onClick={() => setSheet({ open: true, editing: b })}
                      className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${cat.label} budget`}
                      onClick={() => setPending(b)}
                      className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <ProgressBar
                    className="mt-3"
                    bp={l.usedBp}
                    tone={l.status}
                    label={`${cat.label}: ${pctText(l.usedBp)} used`}
                  />
                  <div className="mt-1.5 flex justify-between text-xs">
                    <span className="text-muted-foreground">{pctText(l.usedBp)} used</span>
                    <span
                      className={
                        l.remainingPaise < 0 ? "font-semibold text-destructive" : "font-semibold"
                      }
                    >
                      {l.remainingPaise < 0
                        ? `${formatMoney(-l.remainingPaise)} over`
                        : `${formatMoney(l.remainingPaise)} left`}
                    </span>
                  </div>
                  {l.spentPaise > 0 && (
                    <Link
                      to="/transactions"
                      search={{ category: l.category, month: monthKey(month) }}
                      className="mt-2 inline-block text-xs font-semibold text-coral"
                    >
                      See transactions
                    </Link>
                  )}
                </Card>
              );
            })}
          </div>

          {unbudgeted.length > 0 && (
            <Card>
              <SectionTitle title="Spending without a budget" />
              <ul className="space-y-2">
                {unbudgeted.slice(0, 5).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between text-sm">
                    <span>{getCategory(k).label}</span>
                    <span className="num font-semibold">{formatMoney(v)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Spending = confirmed expenses minus refunds in each category for the month. Transfers and
        savings contributions aren't counted.
      </p>

      <BudgetSheet
        open={sheet.open}
        onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))}
        editing={sheet.editing}
        usedCategories={list.map((b) => b.category)}
      />
      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this budget?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? `The ${getCategory(pending.category).label} limit of ${formatMoney(pending.limit_paise)} will be removed. Your transactions stay as they are.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={remove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
