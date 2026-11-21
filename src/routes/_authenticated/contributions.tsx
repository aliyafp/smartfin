import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { HandCoins, Info, Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  EmptyState,
  ErrorNote,
  NativeSelect,
  PageHeader,
  SkeletonBlock,
} from "@/components/smartfin/ui-bits";
import { PlanTabs } from "@/components/smartfin/plans/plan-bits";
import { ContributionSheet } from "@/components/smartfin/plans/contribution-sheet";
import { ContributionHistory } from "@/components/smartfin/plans/contribution-history";
import { errorMessage } from "@/lib/data/queries";
import { contributionsQuery, goalsQuery, type Contribution } from "@/lib/data/plans";
import { formatMoney } from "@/lib/finance/money";
import { monthKey, monthOf } from "@/lib/finance/monthly";
import { contributionHistory } from "@/lib/finance/plans";

export const Route = createFileRoute("/_authenticated/contributions")({
  validateSearch: z.object({ goal: z.string().uuid().optional().catch(undefined) }),
  head: () => ({
    meta: [
      { title: "Savings contributions — SMARTFIN" },
      {
        name: "description",
        content:
          "Every amount you've added to or withdrawn from your savings goals, month by month.",
      },
    ],
  }),
  component: ContributionsPage,
});

function ContributionsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const goals = useQuery(goalsQuery);
  const contribs = useQuery(contributionsQuery);
  const [entry, setEntry] = useState<{ open: boolean; editing: Contribution | null }>({
    open: false,
    editing: null,
  });

  const goalFilter =
    search.goal && goals.data?.some((g) => g.id === search.goal) ? search.goal : "";
  const list = useMemo(
    () => (contribs.data ?? []).filter((c) => !goalFilter || c.goal_id === goalFilter),
    [contribs.data, goalFilter],
  );
  const thisMonth = contributionHistory(list).find((m) => m.key === monthKey(monthOf(new Date())));
  const allTime = list.reduce(
    (s, c) => s + (c.kind === "withdrawal" ? -c.amount_paise : c.amount_paise),
    0,
  );
  const loading = goals.isLoading || contribs.isLoading;
  const err = goals.error ?? contribs.error;
  const hasGoals = (goals.data ?? []).length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contributions"
        subtitle="Money added to your savings goals"
        action={
          hasGoals ? (
            <Button
              size="icon"
              aria-label="Add contribution"
              onClick={() => setEntry({ open: true, editing: null })}
            >
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
          <SkeletonBlock className="h-24 rounded-3xl" />
          <SkeletonBlock className="h-40" />
        </div>
      ) : !hasGoals ? (
        <EmptyState
          icon={<Target className="size-7" />}
          title="Create a savings goal first"
          body="Contributions are added towards a goal. Create one, then record money as you save it."
          action={
            <Button asChild>
              <Link to="/goals">
                <Plus />
                Create a goal
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-xs font-semibold text-muted-foreground">Saved this month</p>
              <p className="num mt-1 text-xl font-extrabold">
                {formatMoney(thisMonth?.netPaise ?? 0, { decimals: "never" })}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold text-muted-foreground">Saved in total</p>
              <p className="num mt-1 text-xl font-extrabold">
                {formatMoney(allTime, { decimals: "never" })}
              </p>
            </Card>
          </div>
          <NativeSelect
            label="Filter by goal"
            value={goalFilter}
            onChange={(v) => navigate({ to: "/contributions", search: v ? { goal: v } : {} })}
            options={(goals.data ?? []).map((g) => [g.id, g.name] as const)}
            placeholder="All goals"
          />
          {list.length === 0 ? (
            <EmptyState
              icon={<HandCoins className="size-7" />}
              title="No contributions yet"
              body="Record money each time you set some aside. Your monthly history builds up here."
              action={
                <Button onClick={() => setEntry({ open: true, editing: null })}>
                  <Plus />
                  Add contribution
                </Button>
              }
            />
          ) : (
            <ContributionHistory
              contributions={list}
              goals={goals.data ?? []}
              showGoal
              onEdit={(c) => setEntry({ open: true, editing: c })}
            />
          )}
        </>
      )}

      <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Contributions are tracked separately and don't change your income, spending or source
        balances.
      </p>

      <ContributionSheet
        open={entry.open}
        onOpenChange={(o) => setEntry((s) => ({ ...s, open: o }))}
        goals={goals.data ?? []}
        contributions={contribs.data ?? []}
        editing={entry.editing}
        defaultGoalId={goalFilter || undefined}
      />
    </div>
  );
}
