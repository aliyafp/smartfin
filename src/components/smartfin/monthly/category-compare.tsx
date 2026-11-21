import { Link } from "@tanstack/react-router";
import { formatMoney } from "@/lib/finance/money";
import { getCategory } from "@/lib/finance/categories";
import type { CategoryChange } from "@/lib/finance/monthly";
import { CategoryIcon, TONE_FILL } from "@/components/smartfin/category-icon";
import { ChangeChip } from "./change-chip";

/** Two bars per category (this month, compared month), scaled to the largest value. */
export function CategoryCompare({ items, curLabel, prevLabel, month }: { items: CategoryChange[]; curLabel: string; prevLabel: string; /** YYYY-MM the bars link to */ month?: string }) {
  const max = Math.max(1, ...items.flatMap((c) => [c.current, c.previous]));
  return (
    <div className="space-y-1">
      <div className="mb-2 flex justify-end gap-4 text-[11px] font-semibold text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-coral" />{curLabel}</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-violet/45" />{prevLabel}</span>
      </div>
      <ul className="space-y-1">
        {items.map((c) => {
          const cat = getCategory(c.category);
          return (
            <li key={c.category}>
              <Link to="/transactions" search={{ category: c.category, month }} className="flex items-start gap-3 rounded-2xl px-1 py-2 hover:bg-muted/60">
                <CategoryIcon category={c.category} className="size-9 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-semibold">{cat.label}</span>
                    <ChangeChip m={c} />
                  </div>
                  <div className="space-y-0.5">
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${(c.current / max) * 100}%`, background: TONE_FILL[cat.tone] }} /></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet/45 transition-all duration-700" style={{ width: `${(c.previous / max) * 100}%` }} /></div>
                  </div>
                  <p className="num text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{formatMoney(c.current, { decimals: "never" })}</span> vs {formatMoney(c.previous, { decimals: "never" })}
                    {c.delta !== 0 && <> · {formatMoney(c.delta, { decimals: "never", signed: true })}</>}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
