import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatMoney } from "@/lib/finance/money";
import type { TrendPoint } from "@/lib/finance/engine";

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const data = points.map((p) => ({ ...p, expensePaise: Math.max(0, p.expensePaise) }));
  return (
    <div className="h-48" role="img" aria-label="Income versus expenses chart">
      <ResponsiveContainer>
        <BarChart data={data} barGap={2} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={8} />
          <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ borderRadius: 14, border: "1px solid var(--border)", fontSize: 12 }}
            formatter={(v: number, n: string) => [formatMoney(v), n === "incomePaise" ? "Income" : "Expenses"]} />
          <Bar dataKey="incomePaise" fill="var(--turquoise)" radius={[6, 6, 0, 0]} maxBarSize={18} />
          <Bar dataKey="expensePaise" fill="var(--coral)" radius={[6, 6, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex justify-center gap-4 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-turquoise" />Income</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-coral" />Expenses</span>
      </div>
    </div>
  );
}
