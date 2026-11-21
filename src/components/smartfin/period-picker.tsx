import { useState } from "react";
import { cn } from "@/lib/utils";
import { periodRange, type DateRange, type PeriodKey } from "@/lib/finance/engine";

const OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "prev_month", label: "Last month" },
  { key: "custom", label: "Custom" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function usePeriod(initial: PeriodKey = "month") {
  const [key, setKey] = useState<PeriodKey>(initial);
  const now = new Date();
  const [custom, setCustom] = useState({ from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) });
  const range: DateRange = periodRange(key, new Date(), custom);
  return { key, setKey, custom, setCustom, range };
}

export function PeriodPicker({ period }: { period: ReturnType<typeof usePeriod> }) {
  return (
    <div>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Period">
        {OPTIONS.map((o) => (
          <button key={o.key} role="radio" aria-checked={period.key === o.key} onClick={() => period.setKey(o.key)}
            className={cn("h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors", period.key === o.key ? "bg-plum text-on-brand" : "bg-card text-muted-foreground shadow-card hover:text-foreground")}>
            {o.label}
          </button>
        ))}
      </div>
      {period.key === "custom" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-muted-foreground">From
            <input type="date" value={period.custom.from} max={period.custom.to} onChange={(e) => e.target.value && period.setCustom({ ...period.custom, from: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground" />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">To
            <input type="date" value={period.custom.to} min={period.custom.from} onChange={(e) => e.target.value && period.setCustom({ ...period.custom, to: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground" />
          </label>
        </div>
      )}
    </div>
  );
}

export function describeRange(r: DateRange) {
  const end = new Date(r.end.getTime() - 1);
  const f = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  return f(r.start) === f(end) ? f(r.start) : `${f(r.start)} – ${f(end)}`;
}
