import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/budgets", label: "Budgets" },
  { to: "/goals", label: "Savings goals" },
  { to: "/contributions", label: "Contributions" },
] as const;

/** Switch between the three planning pages that share the Budgets tab. */
export function PlanTabs() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Planning"
      className="grid grid-cols-3 gap-1 rounded-full bg-card p-1 shadow-card"
    >
      {TABS.map((t) => {
        const active = pathname === t.to || pathname.startsWith(t.to + "/");
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "grid h-10 place-items-center rounded-full text-xs font-bold transition-colors",
              active ? "bg-coral text-on-brand" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export type BarTone = "ok" | "near" | "over" | "goal" | "done";
const FILL: Record<BarTone, string> = {
  ok: "bg-income",
  near: "bg-saffron",
  over: "bg-destructive",
  goal: "bg-coral",
  done: "bg-income",
};

/** Progress bar; `bp` is basis points (10000 = full). Values above 100% fill the bar. */
export function ProgressBar({
  bp,
  tone,
  label,
  className,
}: {
  bp: number;
  tone: BarTone;
  label: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, bp / 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full transition-all", FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const STATUS_CHIP: Record<string, string> = {
  ok: "bg-turquoise/20 text-income",
  near: "bg-saffron/30 text-plum",
  over: "bg-destructive/10 text-destructive",
  completed: "bg-turquoise/20 text-income",
  overdue: "bg-saffron/30 text-plum",
  active: "bg-coral/12 text-coral",
};
export function StatusChip({
  status,
  children,
}: {
  status: keyof typeof STATUS_CHIP;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        STATUS_CHIP[status],
      )}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  error,
  children,
  htmlFor,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

export const pctText = (bp: number) => `${Math.round(bp / 100)}%`;
const pad = (n: number) => String(n).padStart(2, "0");
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const formatDay = (iso: string) => {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};
