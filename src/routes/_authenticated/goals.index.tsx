import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronRight, Info, Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  SkeletonBlock,
} from "@/components/smartfin/ui-bits";
import { Money } from "@/components/smartfin/money";
import {
  PlanTabs,
  ProgressBar,
  StatusChip,
  formatDay,
  pctText,
} from "@/components/smartfin/plans/plan-bits";
import { GoalSheet } from "@/components/smartfin/plans/goal-sheet";
import { ContributionSheet } from "@/components/smartfin/plans/contribution-sheet";
import { errorMessage } from "@/lib/data/queries";
import { contributionsQuery, goalsQuery } from "@/lib/data/plans";
import { formatMoney } from "@/lib/finance/money";
import { goalProgress } from "@/lib/finance/plans";

export const Route = createFileRoute("/_authenticated/goals/")({
  head: () => ({
    meta: [
      { title: "Savings goals — SMARTFIN" },
      { name: "description", content: "Track progress towards your savings goals." },
    ],
  }),
  component: GoalsPage,
});

function GoalsPage() {
  const goals = useQuery(goalsQuery);
  const contribs = useQuery(contributionsQuery);
  const [goalOpen, setGoalOpen] = useState(false);
  const [addFor, setAddFor] = useState<string | null>(null);

  const rows = useMemo(
    () => (goals.data ?? []).map((g) => ({ g, p: goalProgress(g, contribs.data ?? []) })),
    [goals.data, contribs.data],
  );
  const totals = rows.reduce(
    (s, r) => ({ saved: s.saved + r.p.savedPaise, target: s.target + r.g.target_paise }),
    { saved: 0, target: 0 },
  );
  const loading = goals.isLoading || contribs.isLoading;
  const err = goals.error ?? contribs.error;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Savings goals"
        subtitle="Put money aside for what matters"
        action={
          rows.length > 0 ? (
            <Button size="icon" aria-label="New goal" onClick={() => setGoalOpen(true)}>
              <Plus />
            </Button>
          ) : undefined
        }
      />
      <PlanTabs />

      {err ? (
        <ErrorNote
          message={errorMessage(err)}
          onRetry={() => {
            goals.refetch();
            contribs.refetch();
          }}
        />
      ) : loading ? (
        <div className="space-y-3">
          <SkeletonBlock className="h-36 rounded-3xl" />
          <SkeletonBlock className="h-28" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Target className="size-7" />}
          title="Create your first savings goal"
          body="Name it, set a target and an optional date. Add money whenever you save and SMARTFIN shows your progress."
          action={
            <Button onClick={() => setGoalOpen(true)}>
              <Plus />
              New goal
            </Button>
          }
        />
      ) : (
        <>
          <section className="relative overflow-hidden rounded-[1.75rem] bg-brand-gradient p-5 text-on-brand shadow-brand">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-card/15" />
            <p className="text-xs font-semibold uppercase tracking-wider opacity-90">Total saved</p>
            <p className="mt-1 text-4xl font-extrabold num">
              <Money paise={totals.saved} decimals="never" />
            </p>
            <p className="mt-2 text-xs opacity-90">
              towards {formatMoney(totals.target, { decimals: "never" })} across {rows.length} goal
              {rows.length === 1 ? "" : "s"} ·{" "}
              {rows.filter((r) => r.p.status === "completed").length} completed
            </p>
          </section>

          <div className="space-y-3">
            {rows.map(({ g, p }) => (
              <Card key={g.id} className="p-4">
                <Link to="/goals/$id" params={{ id: g.id }} className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-coral/15 text-coral">
                    <Target className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                      <span className="truncate">{g.name}</span>
                      {p.status === "completed" && (
                        <StatusChip status="completed">Reached</StatusChip>
                      )}
                      {p.status === "overdue" && (
                        <StatusChip status="overdue">Past date</StatusChip>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="num font-semibold text-foreground">
                        {formatMoney(p.savedPaise)}
                      </span>{" "}
                      of {formatMoney(g.target_paise)}
                      {g.target_date ? ` · by ${formatDay(g.target_date)}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="size-5 text-muted-foreground" />
                </Link>
                <ProgressBar
                  className="mt-3"
                  bp={p.progressBp}
                  tone={p.status === "completed" ? "done" : "goal"}
                  label={`${g.name}: ${pctText(p.progressBp)} saved`}
                />
                <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {pctText(p.progressBp)} ·{" "}
                    {p.status === "completed"
                      ? "goal reached"
                      : `${formatMoney(p.remainingPaise)} to go`}
                    {p.perMonthPaise ? ` · ${formatMoney(p.perMonthPaise)}/month` : ""}
                  </span>
                  {p.status !== "completed" && (
                    <button
                      type="button"
                      onClick={() => setAddFor(g.id)}
                      className="font-semibold text-coral"
                    >
                      Add money
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <Link
            to="/contributions"
            className="flex items-center justify-between rounded-3xl bg-card p-4 text-sm font-semibold shadow-card"
          >
            Monthly contribution history
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </>
      )}

      <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Savings are tracked on their own. Adding or withdrawing money here doesn't change your
        income, spending or source balances.
      </p>

      <GoalSheet open={goalOpen} onOpenChange={setGoalOpen} editing={null} />
      <ContributionSheet
        open={addFor !== null}
        onOpenChange={(o) => !o && setAddFor(null)}
        goals={goals.data ?? []}
        contributions={contribs.data ?? []}
        editing={null}
        defaultGoalId={addFor ?? undefined}
      />
    </div>
  );
}
