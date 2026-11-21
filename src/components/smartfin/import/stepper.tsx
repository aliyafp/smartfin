import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const IMPORT_STEPS = ["Upload", "Columns", "Review", "Saved"] as const;

export function ImportStepper({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Import progress">
      {IMPORT_STEPS.map((label, i) => {
        const done = i < step, active = i === step;
        return (
          <li key={label} className="space-y-1.5" aria-current={active ? "step" : undefined}>
            <div className={cn("h-1.5 rounded-full transition-colors duration-500", done || active ? "bg-coral" : "bg-muted")} />
            <p className={cn("flex items-center gap-1 text-[11px] font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
              {done && <Check className="size-3 text-coral" />}{label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
