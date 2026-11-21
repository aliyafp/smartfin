import { cn } from "@/lib/utils";
import { formatMoney, type FormatOptions } from "@/lib/finance/money";

export function Money({ paise, className, ...opts }: { paise: number; className?: string } & FormatOptions) {
  return <span className={cn("num", className)}>{formatMoney(paise, opts)}</span>;
}
