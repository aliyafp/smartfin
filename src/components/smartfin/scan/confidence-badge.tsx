import { CONFIDENCE_LABELS, type Confidence } from "@/lib/extract/types";
import { cn } from "@/lib/utils";

const TONE: Record<Confidence, string> = {
  high: "bg-turquoise/20 text-income",
  medium: "bg-saffron/30 text-plum",
  low: "bg-coral/15 text-coral",
  not_detected: "bg-muted text-muted-foreground",
};
const SHORT: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low", not_detected: "Not detected" };

export function ConfidenceBadge({ level, className }: { level: Confidence; className?: string }) {
  return (
    <span title={CONFIDENCE_LABELS[level]} aria-label={CONFIDENCE_LABELS[level]} className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", TONE[level], className)}>
      {SHORT[level]}
    </span>
  );
}
