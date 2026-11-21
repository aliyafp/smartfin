import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatMoney } from "@/lib/finance/money";

/** Income and expenses side by side for two months. */
export function MonthBars({ income, expenses, curLabel, prevLabel }: { income: [number, number]; expenses: [number, number]; curLabel: string; prevLabel: string }) {
  const data = [
    { name: "Income", current: income[0], previous: income[1] },
    { name: "Expenses", current: Math.max(0, expenses[0]), previous: Math.max(0, expenses[1]) },
  ];
  return (
    <div className="h-52" role="img" aria-label={`Income and expenses, ${curLabel} compared with ${prevLabel}`}>
      <ResponsiveContainer>
        <BarChart data={data} barGap={6} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
          <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ borderRadius: 14, border: "1px solid var(--border)", fontSize: 12 }}
            formatter={(v: number, n: string) => [formatMoney(v, { decimals: "never" }), n === "current" ? curLabel : prevLabel]} />
          <Bar dataKey="previous" fill="var(--violet)" fillOpacity={0.45} radius={[8, 8, 0, 0]} maxBarSize={44} />
          <Bar dataKey="current" fill="var(--coral)" radius={[8, 8, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex justify-center gap-4 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-violet/45" />{prevLabel}</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-coral" />{curLabel}</span>
      </div>
    </div>
  );
}
