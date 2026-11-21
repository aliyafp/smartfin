import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS } from "@/lib/finance/categories";
import { paiseToInput, parseAmountToPaise } from "@/lib/finance/money";
import { TXN_TYPE_LABELS, type TxnType } from "@/lib/finance/types";
import type { Source, Transaction, TxnInput } from "@/lib/data/queries";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const schema = z.object({
  description: z.string().trim().min(1, "Add a merchant or description").max(120),
  reference: z.string().trim().max(64, "Max 64 characters"),
  notes: z.string().trim().max(500, "Max 500 characters"),
});

type Errors = Partial<Record<"amount" | "description" | "category" | "source" | "to" | "date" | "reference" | "notes", string>>;

export function TransactionForm({ initial, sources, onSubmit, submitLabel, cancelTo }: {
  initial?: Transaction; sources: Source[]; onSubmit: (v: TxnInput) => Promise<void>; submitLabel: string; cancelTo: string;
}) {
  const start = initial ? new Date(initial.occurred_at) : new Date();
  const [type, setType] = useState<TxnType>((initial?.txn_type as TxnType) ?? "expense");
  const [amount, setAmount] = useState(initial ? paiseToInput(initial.amount_paise) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [date, setDate] = useState(toDate(start));
  const [time, setTime] = useState(toTime(start));
  const [sourceId, setSourceId] = useState(initial?.source_id ?? sources[0]?.id ?? "");
  const [toId, setToId] = useState(initial?.to_source_id ?? "");
  const [method, setMethod] = useState(initial?.payment_method ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const changeType = (t: TxnType) => {
    setType(t);
    if (t === "transfer") setCategory("");
    else if (!(t === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).some((c) => c.key === category)) setCategory("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    const paise = parseAmountToPaise(amount);
    if (paise === null || paise <= 0) errs.amount = "Enter an amount like 450 or 1,250.75";
    else if (paise >= 100000000000) errs.amount = "Amount is too large";
    const parsed = schema.safeParse({ description, reference, notes });
    if (!parsed.success) for (const i of parsed.error.issues) errs[i.path[0] as keyof Errors] = i.message;
    if (type !== "transfer" && !category) errs.category = "Choose a category";
    if (type === "transfer") {
      if (!sourceId) errs.source = "Choose where money moved from";
      if (!toId) errs.to = "Choose where money moved to";
      else if (toId === sourceId) errs.to = "Pick a different source";
    }
    const when = new Date(`${date}T${time || "12:00"}`);
    if (!date || Number.isNaN(when.getTime())) errs.date = "Choose a valid date";
    setErrors(errs);
    if (Object.keys(errs).length || paise === null) return;

    setBusy(true);
    try {
      await onSubmit({
        txn_type: type, amount_paise: paise, description: description.trim(),
        category: type === "transfer" ? null : category, occurred_at: when.toISOString(),
        source_id: sourceId || null, to_source_id: type === "transfer" ? toId : null,
        payment_method: method || null, reference: reference.trim() || null, notes: notes.trim() || null,
      });
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid grid-cols-4 gap-1 rounded-full bg-card p-1 shadow-card" role="radiogroup" aria-label="Transaction type">
        {(Object.keys(TXN_TYPE_LABELS) as TxnType[]).map((t) => (
          <button type="button" key={t} role="radio" aria-checked={type === t} onClick={() => changeType(t)}
            className={cn("h-10 rounded-full text-xs font-bold transition-colors", type === t ? "bg-coral text-on-brand" : "text-muted-foreground")}>
            {TXN_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="rounded-3xl bg-card p-5 text-center shadow-card">
        <label htmlFor="amount" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</label>
        <div className="mt-1 flex items-center justify-center gap-1">
          <span className="text-3xl font-extrabold text-muted-foreground">₹</span>
          <input id="amount" inputMode="decimal" autoFocus={!initial} placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="num w-48 bg-transparent text-center text-4xl font-extrabold outline-none placeholder:text-border" />
        </div>
        {errors.amount && <p className="mt-1 text-xs font-medium text-destructive">{errors.amount}</p>}
      </div>

      <F label={type === "transfer" ? "Description" : "Merchant or description"} error={errors.description}>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === "income" ? "e.g. Salary" : "e.g. Swiggy"} className="h-12 rounded-2xl bg-card" />
      </F>

      {type !== "transfer" && (
        <F label="Category" error={errors.category}>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <button type="button" key={c.key} onClick={() => setCategory(c.key)} aria-pressed={category === c.key}
                className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", category === c.key ? "border-coral bg-coral/10 text-coral" : "border-border bg-card text-muted-foreground")}>
                {c.label}
              </button>
            ))}
          </div>
        </F>
      )}

      <div className="grid grid-cols-2 gap-3">
        <F label="Date" error={errors.date}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-2xl bg-card" /></F>
        <F label="Time"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12 rounded-2xl bg-card" /></F>
      </div>

      <F label={type === "transfer" ? "From source" : "Source"} error={errors.source}>
        <Select value={sourceId} onChange={setSourceId} options={sources.map((s) => [s.id, s.name])} placeholder={sources.length ? "Not specified" : "No sources yet — add one in Sources"} />
      </F>
      {type === "transfer" && (
        <F label="To source" error={errors.to}>
          <Select value={toId} onChange={setToId} options={sources.filter((s) => s.id !== sourceId).map((s) => [s.id, s.name])} placeholder="Choose destination" />
        </F>
      )}
      {type === "transfer" && sources.length < 2 && (
        <p className="text-xs text-muted-foreground">Transfers need two sources. <Link to="/sources" className="font-semibold text-coral">Add a source</Link></p>
      )}

      <F label="Payment method (optional)">
        <Select value={method} onChange={setMethod} options={PAYMENT_METHODS.map((m) => [m, m])} placeholder="Not specified" />
      </F>
      <F label="Reference number (optional)" error={errors.reference}>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UPI ref 4021…" className="h-12 rounded-2xl bg-card" />
      </F>
      <F label="Notes (optional)" error={errors.notes}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="rounded-2xl bg-card" />
      </F>

      <div className="flex gap-3 pt-2">
        <Button asChild variant="soft" size="lg" className="flex-1"><Link to={cancelTo}>Cancel</Link></Button>
        <Button type="submit" size="lg" className="flex-1" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{submitLabel}</Button>
      </div>
    </form>
  );
}

function F({ label, error, children }: { label: string; error?: string | undefined; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold">{label}</p>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: (readonly [string, string])[]; placeholder: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-2xl border border-input bg-card px-3 text-sm">
      <option value="">{placeholder}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
