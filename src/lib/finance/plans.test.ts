import { describe, expect, it } from "vitest";
import {
  budgetReport,
  budgetStatus,
  contributionHistory,
  goalBalance,
  goalProgress,
  type ContributionInput,
} from "./plans";
import { summarize } from "./engine";
import type { CalcTxn } from "./types";

const nov = { year: 2026, month: 10 };
let n = 0;
const t = (
  txn_type: CalcTxn["txn_type"],
  rupees: number,
  category: string | null,
  day = 10,
  extra: Partial<CalcTxn> = {},
): CalcTxn => ({
  id: `t${n++}`,
  txn_type,
  amount_paise: rupees * 100,
  category,
  occurred_at: new Date(2026, 10, day, 12).toISOString(),
  source_id: null,
  to_source_id: null,
  ...extra,
});

describe("budget progress", () => {
  it("counts expenses minus refunds in the category for the month", () => {
    const r = budgetReport(
      [{ id: "b", category: "food", limit_paise: 500000 }],
      [t("expense", 2000, "food"), t("expense", 1500, "food"), t("refund", 500, "food")],
      nov,
    );
    expect(r.lines[0]?.spentPaise).toBe(300000);
    expect(r.lines[0]?.remainingPaise).toBe(200000);
    expect(r.lines[0]?.usedBp).toBe(6000);
  });
  it("ignores transfers, other categories, other months and unconfirmed records", () => {
    const txns = [
      t("transfer", 9000, "food"),
      t("expense", 700, "shopping"),
      t("income", 50000, "salary"),
      { ...t("expense", 800, "food"), occurred_at: new Date(2026, 9, 31, 12).toISOString() },
      t("expense", 400, "food", 12, { confirmation_status: "pending" }),
      t("expense", 100, "food"),
    ];
    expect(
      budgetReport([{ id: "b", category: "food", limit_paise: 100000 }], txns, nov).lines[0]
        ?.spentPaise,
    ).toBe(10000);
  });
  it("warns from 80% and is over only when spending exceeds the limit", () => {
    expect(budgetStatus(79_99, 100_00)).toBe("ok");
    expect(budgetStatus(80_00, 100_00)).toBe("near");
    expect(budgetStatus(100_00, 100_00)).toBe("near");
    expect(budgetStatus(100_01, 100_00)).toBe("over");
  });
  it("never shows negative spending when refunds exceed expenses", () => {
    const r = budgetReport(
      [{ id: "b", category: "shopping", limit_paise: 100000 }],
      [t("expense", 200, "shopping"), t("refund", 500, "shopping")],
      nov,
    );
    expect(r.lines[0]?.spentPaise).toBe(0);
  });
  it("uncategorised spending can have its own budget", () => {
    const r = budgetReport(
      [{ id: "b", category: "uncategorised", limit_paise: 100000 }],
      [t("expense", 300, null)],
      nov,
    );
    expect(r.lines[0]?.spentPaise).toBe(30000);
  });
  it("totals add up across budgets and count over/near lines", () => {
    const r = budgetReport(
      [
        { id: "a", category: "food", limit_paise: 100000 },
        { id: "b", category: "transport", limit_paise: 50000 },
      ],
      [t("expense", 1200, "food"), t("expense", 450, "transport")],
      nov,
    );
    expect(r.totalLimitPaise).toBe(150000);
    expect(r.totalSpentPaise).toBe(165000);
    expect(r.totalRemainingPaise).toBe(-15000);
    expect(r.overCount).toBe(1);
    expect(r.nearCount).toBe(1);
    expect(r.lines[0]?.category).toBe("food");
  });
});

const c = (
  goal_id: string,
  kind: string,
  rupees: number,
  contributed_on: string,
  id = `c${n++}`,
): ContributionInput => ({ id, goal_id, kind, amount_paise: rupees * 100, contributed_on });

describe("savings goal progress", () => {
  const today = new Date(2026, 10, 21);
  it("saved = deposits − withdrawals for that goal only", () => {
    const p = goalProgress(
      { id: "g", target_paise: 10000000, target_date: null },
      [
        c("g", "deposit", 30000, "2026-10-01"),
        c("g", "withdrawal", 5000, "2026-11-02"),
        c("other", "deposit", 99999, "2026-11-01"),
      ],
      today,
    );
    expect(p.savedPaise).toBe(2500000);
    expect(p.remainingPaise).toBe(7500000);
    expect(p.progressBp).toBe(2500);
    expect(p.status).toBe("active");
  });
  it("is completed when the target is reached, and progress caps at 100%", () => {
    const p = goalProgress(
      { id: "g", target_paise: 100000, target_date: "2026-12-31" },
      [c("g", "deposit", 1500, "2026-11-01")],
      today,
    );
    expect(p.status).toBe("completed");
    expect(p.progressBp).toBe(10000);
    expect(p.remainingPaise).toBe(0);
  });
  it("works out the monthly amount needed, counting the current month", () => {
    const p = goalProgress(
      { id: "g", target_paise: 3000000, target_date: "2027-01-15" },
      [c("g", "deposit", 10000, "2026-11-01")],
      today,
    );
    expect(p.monthsLeft).toBe(3);
    expect(p.perMonthPaise).toBe(666667); // ₹20,000 / 3, rounded up
  });
  it("is overdue when the target date has passed without reaching the goal", () => {
    const p = goalProgress(
      { id: "g", target_paise: 3000000, target_date: "2026-11-20" },
      [],
      today,
    );
    expect(p.status).toBe("overdue");
  });
  it("savings contributions don't change income or spending totals", () => {
    const txns = [t("income", 50000, "salary"), t("expense", 2000, "food")];
    const before = summarize(txns);
    goalProgress(
      { id: "g", target_paise: 100000, target_date: null },
      [c("g", "deposit", 10000, "2026-11-05")],
      today,
    );
    expect(summarize(txns)).toEqual(before);
    expect(before.expensePaise).toBe(200000);
  });
});

describe("monthly contribution history", () => {
  it("groups by month, newest first, with deposits, withdrawals and net", () => {
    const h = contributionHistory([
      c("g", "deposit", 5000, "2026-10-03"),
      c("g", "deposit", 2000, "2026-11-01"),
      c("g", "withdrawal", 500, "2026-11-30"),
      c("h", "deposit", 1000, "2026-10-31"),
    ]);
    expect(h.map((m) => m.key)).toEqual(["2026-11", "2026-10"]);
    expect(h[0]).toMatchObject({
      depositPaise: 200000,
      withdrawalPaise: 50000,
      netPaise: 150000,
      count: 2,
    });
    expect(h[1]).toMatchObject({
      depositPaise: 600000,
      withdrawalPaise: 0,
      netPaise: 600000,
      count: 2,
    });
  });
  it("goal balance excludes the entry being edited", () => {
    const list = [
      c("g", "deposit", 1000, "2026-11-01", "a"),
      c("g", "withdrawal", 300, "2026-11-02", "b"),
    ];
    expect(goalBalance("g", list)).toBe(70000);
    expect(goalBalance("g", list, "b")).toBe(100000);
  });
});
