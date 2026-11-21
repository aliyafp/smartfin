import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Field } from "./plan-bits";
import { paiseToInput, parseAmountToPaise } from "@/lib/finance/money";
import { errorMessage } from "@/lib/data/queries";
import { createGoal, planKeys, updateGoal, type Goal } from "@/lib/data/plans";

export function GoalSheet({
  open,
  onOpenChange,
  editing,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Goal | null;
  onCreated?: (g: Goal) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<{
    name?: string;
    target?: string;
    date?: string;
    notes?: string;
  }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setTarget(editing ? paiseToInput(editing.target_paise) : "");
    setDate(editing?.target_date ?? "");
    setNotes(editing?.notes ?? "");
    setErrors({});
  }, [open, editing]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    const nm = name.trim();
    const paise = parseAmountToPaise(target);
    if (!nm) errs.name = "Give your goal a name";
    else if (nm.length > 60) errs.name = "Up to 60 characters";
    if (paise === null || paise <= 0) errs.target = "Enter a target like 50000 or 1,20,000";
    else if (paise >= 100000000000) errs.target = "Amount is too large";
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.date = "Choose a valid date";
    if (notes.trim().length > 300) errs.notes = "Up to 300 characters";
    setErrors(errs);
    if (Object.keys(errs).length || paise === null) return;
    setBusy(true);
    try {
      const fields = {
        name: nm,
        target_paise: paise,
        target_date: date || null,
        notes: notes.trim() || null,
      };
      if (editing) {
        await updateGoal(editing.id, fields);
        toast.success("Goal updated");
      } else {
        const g = await createGoal(fields);
        toast.success(`“${nm}” goal created`);
        onCreated?.(g);
      }
      await qc.invalidateQueries({ queryKey: planKeys.goals });
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
          <SheetTitle>{editing ? "Edit goal" : "New savings goal"}</SheetTitle>
          <SheetDescription>
            Money you put towards a goal is tracked on its own and doesn't change your income or
            spending.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="space-y-4 px-4 pb-6">
          <Field label="Goal name" error={errors.name} htmlFor="goal-name">
            <Input
              id="goal-name"
              placeholder="e.g. Emergency fund"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 rounded-2xl"
            />
          </Field>
          <Field label="Target amount (₹)" error={errors.target} htmlFor="goal-target">
            <Input
              id="goal-target"
              inputMode="decimal"
              placeholder="e.g. 100000"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-12 rounded-2xl"
            />
          </Field>
          <Field label="Target date (optional)" error={errors.date} htmlFor="goal-date">
            <Input
              id="goal-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-12 rounded-2xl"
            />
          </Field>
          <Field label="Notes (optional)" error={errors.notes} htmlFor="goal-notes">
            <Textarea
              id="goal-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-2xl"
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {editing ? "Save changes" : "Create goal"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
