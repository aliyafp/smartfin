import { Link } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { getCategory } from "@/lib/finance/categories";
import { formatMoney } from "@/lib/finance/money";
import type { CategorySlice } from "@/lib/finance/engine";
import { CategoryIcon, TONE_FILL } from "./category-icon";

export function CategoryChart({ slices, totalPaise }: { slices: CategorySlice[]; totalPaise: number }) {
  return (
    <div>
      <div className="relative mx-auto h-48 w-48">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={slices} dataKey="amountPaise" nameKey="category" innerRadius={62} outerRadius={90} paddingAngle={2} cornerRadius={6} stroke="none" isAnimationActive>
              {slices.map((s) => <Cell key={s.category} fill={TONE_FILL[getCategory(s.category).tone]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Spent</p>
            <p className="num text-lg font-extrabold">{formatMoney(totalPaise, { decimals: "never" })}</p>
          </div>
        </div>
      </div>
      <ul className="mt-4 space-y-1">
        {slices.map((s) => {
          const c = getCategory(s.category);
          return (
            <li key={s.category}>
              <Link to="/transactions" search={{ category: s.category }} className="flex items-center gap-3 rounded-2xl px-1 py-2 hover:bg-muted/60">
                <CategoryIcon category={s.category} className="size-9 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate font-semibold">{c.label}</span>
                    <span className="num font-bold">{formatMoney(s.amountPaise, { decimals: "never" })}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.shareBp / 100}%`, background: TONE_FILL[c.tone] }} />
                    </div>
                    <span className="num w-10 text-right text-xs text-muted-foreground">{(s.shareBp / 100).toFixed(0)}%</span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
