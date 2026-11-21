import { ArrowDownRight, ArrowUpRight, Minus, Sparkle } from "lucide-react";
import { formatMoney } from "@/lib/finance/money";
import { formatPct, type Metric } from "@/lib/finance/monthly";
import { cn } from "@/lib/utils";

/**
 * Direction indicator. Deliberately neutral colours: a rise in spending or a fall
 * in income isn't automatically good or bad, so the arrow carries the meaning.
 */
export function ChangeChip({ m, show = "pct", className }: { m: Metric; show?: "pct" | "amount"; className?: string }) {
  const base = "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold num";
  switch (m.direction) {
    case "none": return <span className={cn(base, "bg-muted text-muted-foreground", className)}>—</span>;
    case "new": return <span className={cn(base, "bg-lavender text-transfer", className)}><Sparkle className="size-3" />New</span>;
    case "flat": return <span className={cn(base, "bg-muted text-muted-foreground", className)}><Minus className="size-3" />≈ Same</span>;
    default: {
      const Icon = m.delta > 0 ? ArrowUpRight : ArrowDownRight;
      const label = show === "amount" || m.changeBp === null ? formatMoney(Math.abs(m.delta), { decimals: "never" }) : formatPct(m.changeBp);
      return <span className={cn(base, "bg-lavender text-transfer", className)} aria-label={`${m.delta > 0 ? "Up" : "Down"} ${label}`}><Icon className="size-3" />{label}</span>;
    }
  }
}
