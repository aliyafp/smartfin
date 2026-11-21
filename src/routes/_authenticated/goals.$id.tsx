import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Pencil, Target, Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Card,
  EmptyState,
  ErrorNote,
  InlineAlert,
  PageHeader,
  SectionTitle,
  SkeletonBlock,
} from "@/components/smartfin/ui-bits";
import { Money } from "@/components/smartfin/money";
import { ProgressBar, StatusChip, formatDay, pctText } from "@/components/smartfin/plans/plan-bits";
import { GoalSheet } from "@/components/smartfin/plans/goal-sheet";
import { ContributionSheet } from "@/components/smartfin/plans/contribution-sheet";
import { ContributionHistory } from "@/components/smartfin/plans/contribution-history";
import { errorMessage } from "@/lib/data/queries";
import {
  contributionsQuery,
  deleteGoal,
  goalsQuery,
  planKeys,
  type Contribution,
} from "@/lib/data/plans";
import { formatMoney } from "@/lib/finance/money";
import { goalProgress } from "@/lib/finance/plans";

export const Route = createFileRoute("/_authenticated/goals/$id")({
  head: () => ({
    meta: [
      { title: "Savings goal — SMARTFIN" },
      { name: "description", content: "Progress and contribution history for one savings goal." },
    ],
  }),
  component: GoalDetail,
});

function GoalDetail() {
  const { id } = Route.useParams();
  const goals = useQuery(goalsQuery);
  const contribs = useQuery(contributionsQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editGoal, setEditGoal] = useState(false);
  const [entry, setEntry] = useState<{
    open: boolean;
    editing: Contribution | null;
    kind: "deposit" | "withdrawal";
  }>({ open: false, editing: null, kind: "deposit" });

  const goal = goals.data?.find((g) => g.id === id);
  const mine = useMemo(
    () => (contribs.data ?? []).filter((c) => c.goal_id === id),
    [contribs.data, id],
  );
  const p = goal ? goalProgress(goal, mine) : null;

  if (goals.isLoading || contribs.isLoading)
    return (
      <div>
        <PageHeader title="Savings goal" back="/goals" />
        <SkeletonBlock className="h-80 rounded-3xl" />
      </div>
    );
  const err = goals.error ?? contribs.error;
  if (err)
    return (
      <div>
        <PageHeader title="Savings goal" back="/goals" />
        <ErrorNote
          message={errorMessage(err)}
          onRetry={() => {
            goals.refetch();
            contribs.refetch();
          }}
        />
      </div>
    );
  if (!goal || !p)
    return (
      <div>
        <PageHeader title="Savings goal" back="/goals" />
        <EmptyState
          icon={<Target className="size-7" />}
          title="Goal not found"
          body="It may have been deleted."
          action={
            <Button asChild variant="soft">
              <Link to="/goals">All goals</Link>
            </Button>
          }
        />
      </div>
    );

  const remove = async () => {
    try {
      await deleteGoal(goal.id);
      await qc.invalidateQueries({ queryKey: planKeys.goals });
      await qc.invalidateQueries({ queryKey: planKeys.contributions });
      toast.success("Goal deleted");
      navigate({ to: "/goals" });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={goal.name}
        subtitle={
          goal.target_date ? `Target date ${formatDay(goal.target_date)}` : "No target date"
        }
        back="/goals"
        action={
          <Button
            size="icon"
            variant="soft"
            aria-label="Edit goal"
            onClick={() => setEditGoal(true)}
          >
            <Pencil />
          </Button>
        }
      />

      <section className="relative overflow-hidden rounded-[1.75rem] bg-brand-gradient p-5 text-on-brand shadow-brand">
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-card/15" />
        <p className="text-xs font-semibold uppercase tracking-wider opacity-90">Saved so far</p>
        <p className="mt-1 text-4xl font-extrabold num">
          <Money paise={p.savedPaise} />
        </p>
        <div
          className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-card/25"
          role="progressbar"
          aria-label="Goal progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(p.progressBp / 100)}
        >
          <div
            className="h-full rounded-full bg-card"
            style={{ width: `${p.progressBp / 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs opacity-90">
          {pctText(p.progressBp)} of {formatMoney(goal.target_paise)}
          {p.remainingPaise > 0 ? ` · ${formatMoney(p.remainingPaise)} to go` : ""}
        </p>
      </section>

      {p.status === "completed" && (
        <InlineAlert tone="info" title="Goal reached 🎉">
          You've saved the full target. You can keep adding or raise the target.
        </InlineAlert>
      )}
      {p.status === "overdue" && (
        <InlineAlert tone="warning" title="Target date has passed">
          {formatMoney(p.remainingPaise)} is still to go. Edit the goal to choose a new date.
        </InlineAlert>
      )}
      {p.status === "active" && p.perMonthPaise !== null && p.monthsLeft !== null && (
        <Card className="flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-2xl bg-lavender text-transfer">
            <CalendarClock className="size-5" />
          </span>
          <p className="text-sm">
            Save <span className="num font-bold">{formatMoney(p.perMonthPaise)}</span> a month for{" "}
            {p.monthsLeft} month{p.monthsLeft === 1 ? "" : "s"} (including this one) to reach it on
            time.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" onClick={() => setEntry({ open: true, editing: null, kind: "deposit" })}>
          <ArrowDownLeft />
          Add money
        </Button>
        <Button
          size="lg"
          variant="soft"
          disabled={p.savedPaise === 0}
          onClick={() => setEntry({ open: true, editing: null, kind: "withdrawal" })}
        >
          <ArrowUpRight />
          Withdraw
        </Button>
      </div>

      {goal.notes && (
        <Card className="p-4 text-sm">
          <p className="text-muted-foreground">Notes</p>
          <p className="mt-1 whitespace-pre-wrap">{goal.notes}</p>
        </Card>
      )}

      <div>
        <SectionTitle
          title="Monthly contribution history"
          action={
            mine.length > 0 ? (
              <StatusChip status="active">
                {mine.length} entr{mine.length === 1 ? "y" : "ies"}
              </StatusChip>
            ) : undefined
          }
        />
        {mine.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-border bg-card/60 px-5 py-8 text-center text-sm text-muted-foreground">
            No money added yet. Tap “Add money” when you save towards this goal.
          </p>
        ) : (
          <ContributionHistory
            contributions={mine}
            goals={goals.data ?? []}
            showGoal={false}
            onEdit={(c) =>
              setEntry({ open: true, editing: c, kind: c.kind as "deposit" | "withdrawal" })
            }
          />
        )}
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 />
            Delete goal
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{goal.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The goal and its {mine.length} savings entr{mine.length === 1 ? "y" : "ies"} will be
              permanently removed. Your transactions aren't affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={remove}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GoalSheet open={editGoal} onOpenChange={setEditGoal} editing={goal} />
      <ContributionSheet
        open={entry.open}
        onOpenChange={(o) => setEntry((s) => ({ ...s, open: o }))}
        goals={goals.data ?? []}
        contributions={contribs.data ?? []}
        editing={entry.editing}
        defaultGoalId={goal.id}
        defaultKind={entry.kind}
      />
    </div>
  );
}
