import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-3xl border border-border/70 bg-card p-5 shadow-card", className)}>{children}</section>;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: string; back?: string; action?: ReactNode }) {
  return (
    <header className="flex items-center gap-3 pt-safe pb-4 pt-5">
      {back && (
        <Link to={back} aria-label="Back" className="grid size-10 place-items-center rounded-full bg-card shadow-card">
          <ChevronLeft className="size-5" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent text-coral">{icon}</div>
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-muted", className)} />;
}

export function DemoBadge({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-saffron/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-plum", className)}>Demo</span>;
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p className="font-semibold text-destructive">Couldn't load your records</p>
      <p className="mt-1 text-muted-foreground">{message}</p>
      {onRetry && <button onClick={onRetry} className="mt-2 font-semibold text-coral underline-offset-4 hover:underline">Try again</button>}
    </div>
  );
}

export function ImportBadge({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-violet/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-transfer", className)}>CSV</span>;
}

export function ScanBadge({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-coral/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-coral", className)}>Scan</span>;
}

const ALERT_TONE = {
  error: "border-destructive/30 bg-destructive/5 text-destructive",
  warning: "border-saffron/50 bg-saffron/15 text-plum",
  info: "border-violet/25 bg-lavender text-plum",
} as const;

export function InlineAlert({ tone = "info", title, children, icon }: { tone?: keyof typeof ALERT_TONE; title?: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-2xl border p-4 text-sm", ALERT_TONE[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn("text-foreground/80", title && "mt-1")}>{children}</div>}
      </div>
    </div>
  );
}

export function NativeSelect({ value, onChange, options, placeholder, className, label }: {
  value: string; onChange: (v: string) => void; options: (readonly [string, string])[]; placeholder?: string; className?: string; label: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn("h-11 w-full rounded-2xl border border-input bg-card px-3 text-sm", className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
