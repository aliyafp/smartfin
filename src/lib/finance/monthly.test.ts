import { describe, expect, it } from "vitest";
import { availableMonths, changeBp, compareMonths, describeChange, detectRecurring, monthRange, paceComparison, possibleDuplicates, type AnalysisTxn } from "./monthly";

let n = 0;
const t = (p: Partial<AnalysisTxn> & Pick<AnalysisTxn, "txn_type" | "amount_paise" | "occurred_at">): AnalysisTxn => ({
  id: String(n++), category: null, source_id: "a", to_source_id: null, description: "x", merchant: null, ...p,
});
const NOV = { year: 2026, month: 10 }, OCT = { year: 2026, month: 9 };
const d = (m: number, day: number) => new Date(2026, m, day, 12).toISOString();

describe("percentage change", () => {
  it("uses ((current − previous) / previous) × 100", () => {
    expect(changeBp(11200, 10000)).toBe(1200); // +12%
    expect(changeBp(9200, 10000)).toBe(-800); // −8%
  });
  it("never divides by zero", () => {
    expect(changeBp(5000, 0)).toBeNull();
    const r = compareMonths([t({ txn_type: "expense", amount_paise: 5000, occurred_at: d(10, 3) })], NOV, OCT);
    expect(r.expenses.changeBp).toBeNull();
    expect(describeChange("Spending", r.expenses)).toBe("No previous-month spending to compare.");
  });
});

describe("monthly totals", () => {
  const txns = [
    t({ txn_type: "income", amount_paise: 5000000, occurred_at: d(10, 1) }),
    t({ txn_type: "expense", amount_paise: 200000, category: "food", occurred_at: d(10, 2) }),
    t({ txn_type: "refund", amount_paise: 50000, category: "food", occurred_at: d(10, 4) }),
    t({ txn_type: "transfer", amount_paise: 900000, to_source_id: "b", occurred_at: d(10, 5) }),
    t({ txn_type: "expense", amount_paise: 30000, category: null, occurred_at: d(10, 6) }),
    t({ txn_type: "income", amount_paise: 4500000, occurred_at: d(9, 1) }),
    t({ txn_type: "expense", amount_paise: 100000, category: "food", occurred_at: d(9, 2) }),
  ];
  const r = compareMonths(txns, NOV, OCT);
  it("excludes transfers and treats refunds as reduced spending, not income", () => {
    expect(r.income.current).toBe(5000000);
    expect(r.expenses.current).toBe(200000 - 50000 + 30000);
    expect(r.net.current).toBe(5000000 - 180000);
  });
  it("keeps uncategorised spending in totals and reports it", () => {
    expect(r.uncategorised).toEqual({ count: 1, paise: 30000 });
    expect(r.categories.find((c) => c.category === "uncategorised")?.current).toBe(30000);
  });
  it("compares categories month to month", () => {
    const food = r.categories.find((c) => c.category === "food")!;
    expect(food).toMatchObject({ current: 150000, previous: 100000, delta: 50000, changeBp: 5000, direction: "up" });
    expect(r.biggestIncrease?.category).toBe("food");
  });
  it("describes income change in rupees", () => {
    expect(describeChange("Income", r.income, { amount: true })).toBe("Income increased by ₹5,000.");
  });
});

describe("month boundaries", () => {
  it("handles months of different lengths", () => {
    const feb = monthRange({ year: 2027, month: 1 });
    expect(feb.start).toEqual(new Date(2027, 1, 1));
    expect(feb.end).toEqual(new Date(2027, 2, 1));
    const r = compareMonths([
      t({ txn_type: "expense", amount_paise: 100, occurred_at: new Date(2027, 1, 28, 23, 59).toISOString() }),
      t({ txn_type: "expense", amount_paise: 999, occurred_at: new Date(2027, 2, 1, 0, 0).toISOString() }),
      t({ txn_type: "expense", amount_paise: 500, occurred_at: new Date(2027, 0, 31, 23, 0).toISOString() }),
    ], { year: 2027, month: 1 }, { year: 2027, month: 0 });
    expect(r.expenses.current).toBe(100);
    expect(r.expenses.previous).toBe(500);
  });
  it("lists every month from the earliest record to now", () => {
    const months = availableMonths([{ occurred_at: d(7, 10) }], new Date(2026, 10, 19));
    expect(months.map((m) => m.month)).toEqual([10, 9, 8, 7]);
  });
});

describe("recurring payments", () => {
  it("labels three monthly payments as likely, with a frequency", () => {
    const rows = [9, 10, 11].map((m) => t({ txn_type: "expense", amount_paise: 64900, description: "NETFLIX.COM", category: "subscriptions", occurred_at: new Date(2026, m - 2, 12).toISOString() }));
    const [r] = detectRecurring(rows);
    expect(r).toMatchObject({ name: "Netflix", occurrences: 3, frequency: "monthly", confidence: "likely", typicalPaise: 64900 });
  });
  it("reports two payments only as possible, without claiming a frequency", () => {
    const rows = [8, 9].map((m) => t({ txn_type: "expense", amount_paise: 1800000, description: "Monthly rent", occurred_at: d(m, 3) }));
    expect(detectRecurring(rows)[0]).toMatchObject({ confidence: "possible", frequency: null });
  });
  it("ignores irregular one-off spending", () => {
    const rows = [d(10, 1), d(10, 3), d(10, 20)].map((at) => t({ txn_type: "expense", amount_paise: 45000, description: "Swiggy", occurred_at: at }));
    expect(detectRecurring(rows)).toEqual([]);
  });
});

describe("insights", () => {
  it("only produces insights when both months have data", () => {
    expect(compareMonths([t({ txn_type: "expense", amount_paise: 5000, occurred_at: d(10, 3) })], NOV, OCT).insights).toEqual([]);
  });
  it("reports category increases from real records", () => {
    const r = compareMonths([
      t({ txn_type: "expense", amount_paise: 1000000, category: "food", description: "Swiggy", occurred_at: d(9, 5) }),
      t({ txn_type: "expense", amount_paise: 1180000, category: "food", description: "Swiggy", occurred_at: d(10, 5) }),
    ], NOV, OCT, new Date(2026, 11, 5));
    expect(r.insights.map((i) => i.text)).toContain("Your Food & Dining spending increased by 18% compared with October.");
    expect(r.insights.map((i) => i.text)).toContain("Swiggy accounted for most of the increase in Food & Dining.");
  });
});

describe("confirmed records only", () => {
  it("leaves unconfirmed records out of income, expenses and categories", () => {
    const r = compareMonths([
      t({ txn_type: "expense", amount_paise: 100000, category: "food", occurred_at: d(10, 2) }),
      t({ txn_type: "expense", amount_paise: 70000, category: "food", occurred_at: d(10, 3), confirmation_status: "pending" }),
      t({ txn_type: "income", amount_paise: 500000, occurred_at: d(10, 3), confirmation_status: "pending" }),
      t({ txn_type: "expense", amount_paise: 40000, category: "food", occurred_at: d(10, 4), confirmation_status: "user_confirmed" }),
    ], NOV, OCT, new Date(2026, 11, 5));
    expect(r.expenses.current).toBe(140000);
    expect(r.income.current).toBe(0);
    expect(r.categories.find((c) => c.category === "food")?.current).toBe(140000);
  });
});

describe("month in progress", () => {
  const rows = [
    t({ txn_type: "expense", amount_paise: 30000, occurred_at: d(10, 5) }),
    t({ txn_type: "expense", amount_paise: 20000, occurred_at: d(9, 4) }),
    t({ txn_type: "expense", amount_paise: 90000, occurred_at: d(9, 25) }),
  ];
  it("compares the first 20 days of November with the first 20 days of October", () => {
    const p = paceComparison(rows, NOV, OCT, new Date(2026, 10, 20, 9))!;
    expect(p).toMatchObject({ day: 20, days: 30, previousDay: 20 });
    expect(p.expenses).toMatchObject({ current: 30000, previous: 20000, changeBp: 5000 });
  });
  it("caps the compared month at its length (31 March vs 28 February)", () => {
    const p = paceComparison([t({ txn_type: "expense", amount_paise: 100, occurred_at: new Date(2027, 1, 28, 20).toISOString() })],
      { year: 2027, month: 2 }, { year: 2027, month: 1 }, new Date(2027, 2, 31, 9))!;
    expect(p).toMatchObject({ day: 31, previousDay: 28, previousDays: 28 });
    expect(p.expenses.previous).toBe(100);
  });
  it("is not used for finished months", () => {
    expect(paceComparison(rows, OCT, { year: 2026, month: 8 }, new Date(2026, 10, 20))).toBeNull();
  });
});

describe("possible duplicates", () => {
  it("flags the same reference or same amount, merchant and day, without removing anything", () => {
    const rows = [
      t({ id: "a", txn_type: "expense", amount_paise: 125000, description: "UPI/Annapurna Tiffin", reference: "632218904417", occurred_at: d(10, 3) }),
      t({ id: "b", txn_type: "expense", amount_paise: 125000, description: "Annapurna Tiffin Services", reference: "6322 1890 4417", occurred_at: d(10, 3) }),
      t({ id: "c", txn_type: "expense", amount_paise: 45000, description: "Swiggy", occurred_at: d(10, 8) }),
      t({ id: "d", txn_type: "expense", amount_paise: 45000, description: "Swiggy", occurred_at: d(10, 8) }),
      t({ id: "e", txn_type: "expense", amount_paise: 45000, description: "Swiggy", occurred_at: d(10, 9) }),
    ];
    const groups = possibleDuplicates(rows);
    expect(groups.map((g) => [g.reason, g.ids])).toEqual([["same_day", ["c", "d"]], ["reference", ["a", "b"]]]);
    const r = compareMonths(rows, NOV, OCT, new Date(2026, 11, 5));
    expect(r.expenses.current).toBe(125000 * 2 + 45000 * 3); // still counted until the user decides
    expect(r.duplicates).toHaveLength(2);
  });
});
