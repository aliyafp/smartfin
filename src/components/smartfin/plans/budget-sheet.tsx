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
import { Field } from "./plan-bits";
import { EXPENSE_CATEGORIES, getCategory } from "@/lib/finance/categories";
import { paiseToInput, parseAmountToPaise } from "@/lib/finance/money";
import { errorMessage } from "@/lib/data/queries";
import { planKeys, saveBudget } from "@/lib/data/plans";

export const BUDGET_CATEGORIES = [
  ...EXPENSE_CATEGORIES.map((c) => [c.key, c.label] as const),
  ["uncategorised", "Uncategorised"] as const,
];

export function BudgetSheet({
  open,
  onOpenChange,
  editing,
  usedCategories,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: { category: string; limit_paise: number } | null;
  usedCategories: string[];
}) {
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<{ category?: string; amount?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory(editing?.category ?? "");
    setAmount(editing ? paiseToInput(editing.limit_paise) : "");
    setErrors({});
  }, [open, editing]);

  const options = BUDGET_CATEGORIES.filter(
    ([k]) => k === editing?.category || !usedCategories.includes(k),
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    const paise = parseAmountToPaise(amount);
    if (!category) errs.category = "Choose a category";
    if (paise === null || paise <= 0) errs.amount = "Enter a monthly limit like 5000 or 2,500.50";
    else if (paise >= 100000000000) errs.amount = "Amount is too large";
    setErrors(errs);
    if (Object.keys(errs).length || paise === null) return;
    setBusy(true);
    try {
      await saveBudget(category, paise);
      await qc.invalidateQueries({ queryKey: planKeys.budgets });
      toast.success(editing ? "Budget updated" : `Budget set for ${getCategory(category).label}`);
      onOpenChange(false);
    } catch (e2) {
      toast.error(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>
            {editing
              ? `Edit ${getCategory(editing.category).label} budget`
              : "Set a monthly budget"}
          </SheetTitle>
          <SheetDescription>
            The limit applies to every month. Refunds lower what you've spent; transfers don't
            count.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="space-y-4 px-4 pb-6">
          {!editing && (
            <Field label="Category" error={errors.category}>
              <NativeSelect
                label="Category"
                value={category}
                onChange={setCategory}
                options={options}
                placeholder={options.length ? "Choose a category" : "Every category has a budget"}
                className="h-12"
              />
            </Field>
          )}
          <Field label="Monthly limit (₹)" error={errors.amount} htmlFor="budget-amount">
            <Input
              id="budget-amount"
              inputMode="decimal"
              placeholder="e.g. 5000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-12 rounded-2xl"
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {editing ? "Save changes" : "Save budget"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
