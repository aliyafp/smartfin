import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { NativeSelect } from "@/components/smartfin/ui-bits";
import { Field, todayISO } from "./plan-bits";
import { formatMoney, paiseToInput, parseAmountToPaise } from "@/lib/finance/money";
import { goalBalance } from "@/lib/finance/plans";
import { errorMessage } from "@/lib/data/queries";
import {
  createContribution,
  planKeys,
  updateContribution,
  type Contribution,
  type Goal,
} from "@/lib/data/plans";
import { cn } from "@/lib/utils";

type Kind = "deposit" | "withdrawal";

export function ContributionSheet({
  open,
  onOpenChange,
  goals,
  contributions,
  editing,
  defaultGoalId,
  defaultKind = "deposit",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goals: Goal[];
  contributions: Contribution[];
  editing: Contribution | null;
  defaultGoalId?: string | undefined;
  defaultKind?: Kind;
}) {
  const qc = useQueryClient();
  const [goalId, setGoalId] = useState("");
  const [kind, setKind] = useState<Kind>("deposit");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{
    goal?: string;
    amount?: string;
    date?: string;
    note?: string;
  }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGoalId(editing?.goal_id ?? defaultGoalId ?? goals[0]?.id ?? "");
    setKind((editing?.kind as Kind | undefined) ?? defaultKind);
    setAmount(editing ? paiseToInput(editing.amount_paise) : "");
    setDate(editing?.contributed_on ?? todayISO());
    setNote(editing?.note ?? "");
    setErrors({});
  }, [open, editing, defaultGoalId, defaultKind, goals]);

  const available = goalId ? goalBalance(goalId, contributions, editing?.id) : 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    const paise = parseAmountToPaise(amount);
    if (!goalId) errs.goal = "Choose a goal";
    if (paise === null || paise <= 0) errs.amount = "Enter an amount like 2000 or 1,500.50";
    else if (paise >= 100000000000) errs.amount = "Amount is too large";
    else if (kind === "withdrawal" && paise > available)
      errs.amount = `You can withdraw up to ${formatMoney(available)} from this goal`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.date = "Choose a valid date";
    else if (date > todayISO()) errs.date = "The date can't be in the future";
    if (note.trim().length > 200) errs.note = "Up to 200 characters";
    setErrors(errs);
    if (Object.keys(errs).length || paise === null) return;
    setBusy(true);
    try {
      const fields = {
        goal_id: goalId,
        kind,
        amount_paise: paise,
        contributed_on: date,
        note: note.trim() || null,
      };
      if (editing) await updateContribution(editing.id, fields);
      else await createContribution(fields);
      await qc.invalidateQueries({ queryKey: planKeys.contributions });
      toast.success(
        editing
          ? "Entry updated"
          : kind === "deposit"
            ? `${formatMoney(paise)} added to savings`
            : `${formatMoney(paise)} withdrawn`,
      );
      onOpenChange(false);
    } catch (e2) {
      toast.error(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] max-w-md overflow-y-auto rounded-t-3xl"
      >
        <SheetHeader>
          <SheetTitle>
            {editing
              ? "Edit savings entry"
              : kind === "deposit"
                ? "Add to savings"
                : "Withdraw from savings"}
          </SheetTitle>
          <SheetDescription>
            Savings entries are tracked separately — they don't change your income, spending or
            balances.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="space-y-4 px-4 pb-6">
          <div
            className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1"
            role="radiogroup"
            aria-label="Entry type"
          >
            {(["deposit", "withdrawal"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "h-10 rounded-full text-xs font-bold transition-colors",
                  kind === k ? "bg-coral text-on-brand" : "text-muted-foreground",
                )}
              >
                {k === "deposit" ? "Add money" : "Withdraw"}
              </button>
            ))}
          </div>
          <Field label="Goal" error={errors.goal}>
            <NativeSelect
              label="Goal"
              value={goalId}
              onChange={setGoalId}
              options={goals.map((g) => [g.id, g.name] as const)}
              placeholder={goals.length ? "Choose a goal" : "Create a goal first"}
              className="h-12"
            />
          </Field>
          <Field label="Amount (₹)" error={errors.amount} htmlFor="contrib-amount">
            <Input
              id="contrib-amount"
              inputMode="decimal"
              placeholder="e.g. 2000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-12 rounded-2xl"
            />
          </Field>
          {kind === "withdrawal" && goalId && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Saved in this goal:{" "}
              <span className="font-semibold">{formatMoney(Math.max(0, available))}</span>
            </p>
          )}
          <Field label="Date" error={errors.date} htmlFor="contrib-date">
            <Input
              id="contrib-date"
              type="date"
              max={todayISO()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-12 rounded-2xl"
            />
          </Field>
          <Field label="Note (optional)" error={errors.note} htmlFor="contrib-note">
            <Input
              id="contrib-note"
              placeholder="e.g. Bonus"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-12 rounded-2xl"
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={busy || goals.length === 0}>
            {busy && <Loader2 className="animate-spin" />}
            {editing ? "Save changes" : kind === "deposit" ? "Add money" : "Withdraw"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
