import { getCategory } from "./categories";
import { categoryBreakdown, summarize } from "./engine";
import { formatMoney } from "./money";
import type { CalcTxn } from "./types";

export interface Insight { id: string; tone: "positive" | "neutral" | "attention"; text: string }

/** Generate insights strictly from recorded data. Returns [] when there's not enough data. */
export function buildInsights(current: CalcTxn[], previous: CalcTxn[]): Insight[] {
  const out: Insight[] = [];
  const cur = summarize(current);
  if (cur.count === 0) return out;

  const top = categoryBreakdown(current)[0];
  if (top) out.push({ id: "top", tone: "neutral", text: `Your highest recorded spending category is ${getCategory(top.category).label} at ${formatMoney(top.amountPaise, { decimals: "never" })}.` });

  if (cur.incomePaise > 0 || cur.expensePaise > 0) {
    if (cur.netPaise > 0) out.push({ id: "net", tone: "positive", text: `You recorded ${formatMoney(cur.netPaise, { decimals: "never" })} more income than expenses in this period.` });
    else if (cur.netPaise < 0) out.push({ id: "net", tone: "attention", text: `Recorded expenses exceed recorded income by ${formatMoney(-cur.netPaise, { decimals: "never" })} in this period.` });
  }

  const prev = summarize(previous);
  if (prev.expensePaise > 0 && cur.expensePaise > 0) {
    const changeBp = Math.round(((cur.expensePaise - prev.expensePaise) * 10000) / prev.expensePaise);
    const pct = Math.abs(changeBp) / 100;
    if (pct >= 5) out.push({ id: "cmp", tone: changeBp > 0 ? "attention" : "positive", text: `Recorded spending is ${pct.toFixed(0)}% ${changeBp > 0 ? "higher" : "lower"} than the previous period.` });
  }
  return out;
}
