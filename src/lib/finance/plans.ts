/**
 * Budgets & savings goals. Pure functions over integer paise.
 *
 * Rules:
 *  - A budget is a monthly limit for one expense category. Spending against it is the
 *    same net category spending every other screen uses: confirmed expenses minus
 *    refunds in that category for the month; transfers never count.
 *  - Status: "over" once spending exceeds the limit, "near" from 80% of the limit,
 *    otherwise "ok".
 *  - Savings contributions are tracked separately: they never change income, spending,
 *    net cash flow or source balances.
 *  - A goal's saved amount = deposits − withdrawals (never below zero).
 */
import { inRange, isCountable } from "./engine";
import { getCategory } from "./categories";
import { monthKey, monthRange, type MonthId } from "./monthly";
import type { CalcTxn } from "./types";

export const NEAR_LIMIT_BP = 8000; // 80%

export type BudgetStatus = "ok" | "near" | "over";
export interface BudgetInput {
  id: string;
  category: string;
  limit_paise: number;
}
export interface BudgetLine {
  id: string;
  category: string;
  limitPaise: number;
  spentPaise: number;
  /** limit − spent; negative when over budget */
  remainingPaise: number;
  /** spent as share of limit in basis points (10000 = 100%), not capped */
  usedBp: number;
  status: BudgetStatus;
}
export interface BudgetReport {
  lines: BudgetLine[];
  totalLimitPaise: number;
  totalSpentPaise: number;
  totalRemainingPaise: number;
  usedBp: number;
  status: BudgetStatus;
  overCount: number;
  nearCount: number;
}

export function budgetStatus(spent: number, limit: number): BudgetStatus {
  if (spent > limit) return "over";
  if (limit > 0 && spent * 10000 >= limit * NEAR_LIMIT_BP) return "near";
  return "ok";
}

const usedBp = (spent: number, limit: number) =>
  limit > 0 ? Math.round((spent * 10000) / limit) : 0;

/** Net spending per category key for the given month (expenses − refunds, confirmed only, floored at 0). */
export function monthCategorySpend(txns: CalcTxn[], month: MonthId): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of inRange(txns, monthRange(month))) {
    if (!isCountable(t) || (t.txn_type !== "expense" && t.txn_type !== "refund")) continue;
    const key = getCategory(t.category).key;
    map.set(
      key,
      (map.get(key) ?? 0) + (t.txn_type === "expense" ? t.amount_paise : -t.amount_paise),
    );
  }
  for (const [k, v] of map) if (v < 0) map.set(k, 0);
  return map;
}

export function budgetReport(
  budgets: BudgetInput[],
  txns: CalcTxn[],
  month: MonthId,
): BudgetReport {
  const spend = monthCategorySpend(txns, month);
  const lines: BudgetLine[] = budgets.map((b) => {
    const spent = spend.get(b.category) ?? 0;
    return {
      id: b.id,
      category: b.category,
      limitPaise: b.limit_paise,
      spentPaise: spent,
      remainingPaise: b.limit_paise - spent,
      usedBp: usedBp(spent, b.limit_paise),
      status: budgetStatus(spent, b.limit_paise),
    };
  });
  const order: Record<BudgetStatus, number> = { over: 0, near: 1, ok: 2 };
  lines.sort((a, b) => order[a.status] - order[b.status] || b.usedBp - a.usedBp);
  const totalLimit = lines.reduce((s, l) => s + l.limitPaise, 0);
  const totalSpent = lines.reduce((s, l) => s + l.spentPaise, 0);
  return {
    lines,
    totalLimitPaise: totalLimit,
    totalSpentPaise: totalSpent,
    totalRemainingPaise: totalLimit - totalSpent,
    usedBp: usedBp(totalSpent, totalLimit),
    status: budgetStatus(totalSpent, totalLimit),
    overCount: lines.filter((l) => l.status === "over").length,
    nearCount: lines.filter((l) => l.status === "near").length,
  };
}

// ---------- Savings goals ----------
export type ContributionKind = "deposit" | "withdrawal";
export interface ContributionInput {
  id: string;
  goal_id: string;
  kind: string;
  amount_paise: number;
  contributed_on: string; /* YYYY-MM-DD */
}
export interface GoalInput {
  id: string;
  target_paise: number;
  target_date: string | null;
}

export const signedAmount = (c: Pick<ContributionInput, "kind" | "amount_paise">) =>
  c.kind === "withdrawal" ? -c.amount_paise : c.amount_paise;

export type GoalStatus = "completed" | "overdue" | "active";
export interface GoalProgress {
  savedPaise: number;
  remainingPaise: number;
  /** saved as share of target in basis points, capped at 10000 */
  progressBp: number;
  status: GoalStatus;
  /** months left including the current month, when a target date is set and not passed */
  monthsLeft: number | null;
  /** amount needed per month to reach the target on time (rounded up to the paisa) */
  perMonthPaise: number | null;
}

const parseDate = (s: string) => {
  const [y = 1970, m = 1, d = 1] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function goalProgress(
  goal: GoalInput,
  contributions: ContributionInput[],
  today = new Date(),
): GoalProgress {
  const saved = Math.max(
    0,
    contributions.filter((c) => c.goal_id === goal.id).reduce((s, c) => s + signedAmount(c), 0),
  );
  const remaining = Math.max(0, goal.target_paise - saved);
  const progressBp = Math.min(10000, Math.floor((saved * 10000) / goal.target_paise));
  if (remaining === 0)
    return {
      savedPaise: saved,
      remainingPaise: 0,
      progressBp: 10000,
      status: "completed",
      monthsLeft: null,
      perMonthPaise: null,
    };
  if (!goal.target_date)
    return {
      savedPaise: saved,
      remainingPaise: remaining,
      progressBp,
      status: "active",
      monthsLeft: null,
      perMonthPaise: null,
    };
  const target = parseDate(goal.target_date);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (target < startOfToday)
    return {
      savedPaise: saved,
      remainingPaise: remaining,
      progressBp,
      status: "overdue",
      monthsLeft: 0,
      perMonthPaise: null,
    };
  const monthsLeft =
    (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth()) + 1;
  return {
    savedPaise: saved,
    remainingPaise: remaining,
    progressBp,
    status: "active",
    monthsLeft,
    perMonthPaise: Math.ceil(remaining / monthsLeft),
  };
}

export interface MonthContribution {
  key: string;
  month: MonthId;
  depositPaise: number;
  withdrawalPaise: number;
  netPaise: number;
  count: number;
}

/** Contributions grouped by calendar month (from the stored date), newest month first. */
export function contributionHistory(contributions: ContributionInput[]): MonthContribution[] {
  const map = new Map<string, MonthContribution>();
  for (const c of contributions) {
    const [y = 1970, m = 1] = c.contributed_on.split("-").map(Number);
    const month = { year: y, month: m - 1 };
    const key = monthKey(month);
    const row = map.get(key) ?? {
      key,
      month,
      depositPaise: 0,
      withdrawalPaise: 0,
      netPaise: 0,
      count: 0,
    };
    if (c.kind === "withdrawal") row.withdrawalPaise += c.amount_paise;
    else row.depositPaise += c.amount_paise;
    row.netPaise = row.depositPaise - row.withdrawalPaise;
    row.count++;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

/** Saved amount in a goal right now; used to stop withdrawals beyond what's saved. */
export function goalBalance(
  goalId: string,
  contributions: ContributionInput[],
  excludeId?: string,
): number {
  return contributions
    .filter((c) => c.goal_id === goalId && c.id !== excludeId)
    .reduce((s, c) => s + signedAmount(c), 0);
}
