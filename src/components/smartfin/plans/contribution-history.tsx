import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Pencil, Trash2 } from "lucide-react";
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
import { Card } from "@/components/smartfin/ui-bits";
import { formatDay } from "./plan-bits";
import { formatMoney } from "@/lib/finance/money";
import { monthLabel } from "@/lib/finance/monthly";
import { contributionHistory } from "@/lib/finance/plans";
import { errorMessage } from "@/lib/data/queries";
import { deleteContribution, planKeys, type Contribution, type Goal } from "@/lib/data/plans";
import { cn } from "@/lib/utils";

/** Monthly contribution history: each month's added / withdrawn / net, then its entries. */
export function ContributionHistory({
  contributions,
  goals,
  showGoal,
  onEdit,
}: {
  contributions: Contribution[];
  goals: Goal[];
  showGoal: boolean;
  onEdit: (c: Contribution) => void;
}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<Contribution | null>(null);
  const goalName = new Map(goals.map((g) => [g.id, g.name]));
  const months = contributionHistory(contributions);

  const remove = async () => {
    if (!pending) return;
    try {
      await deleteContribution(pending.id);
      await qc.invalidateQueries({ queryKey: planKeys.contributions });
      toast.success("Entry deleted");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      {months.map((m) => {
        const entries = contributions.filter((c) => c.contributed_on.startsWith(m.key));
        return (
          <Card key={m.key} className="p-0">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h3 className="font-bold">{monthLabel(m.month)}</h3>
                <p className="text-xs text-muted-foreground">
                  {m.count} entr{m.count === 1 ? "y" : "ies"} · added {formatMoney(m.depositPaise)}
                  {m.withdrawalPaise ? ` · withdrawn ${formatMoney(m.withdrawalPaise)}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={cn(
                    "num font-extrabold whitespace-nowrap",
                    m.netPaise >= 0 ? "text-income" : "text-destructive",
                  )}
                >
                  {formatMoney(m.netPaise, { signed: true })}
                </p>
                <p className="text-[10px] text-muted-foreground">net saved</p>
              </div>
            </div>
            <ul className="divide-y divide-border">
              {entries.map((c) => {
                const out = c.kind === "withdrawal";
                return (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-xl",
                        out ? "bg-saffron/25 text-plum" : "bg-turquoise/20 text-income",
                      )}
                      aria-hidden
                    >
                      {out ? (
                        <ArrowUpRight className="size-4" />
                      ) : (
                        <ArrowDownLeft className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {showGoal
                          ? (goalName.get(c.goal_id) ?? "Goal")
                          : out
                            ? "Withdrawal"
                            : "Added"}
                        {c.note ? ` · ${c.note}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDay(c.contributed_on)}
                        {showGoal ? ` · ${out ? "Withdrawal" : "Added"}` : ""}
                      </p>
                    </div>
                    <p className={cn("num text-sm font-bold whitespace-nowrap", out ? "text-plum" : "text-income")}>
                      {out ? "−" : "+"}
                      {formatMoney(c.amount_paise)}
                    </p>
                    <button
                      type="button"
                      aria-label="Edit entry"
                      onClick={() => onEdit(c)}
                      className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete entry"
                      onClick={() => setPending(c)}
                      className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this savings entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? `${pending.kind === "withdrawal" ? "Withdrawal" : "Contribution"} of ${formatMoney(pending.amount_paise)} on ${formatDay(pending.contributed_on)} will be removed and the goal's progress will update.`
                : ""}
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
    </div>
  );
}
