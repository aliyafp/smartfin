import { describe, expect, it } from "vitest";
import { categoryBreakdown, periodRange, sourceBalances, summarize } from "./engine";
import { formatMoney, parseAmountToPaise } from "./money";
import type { CalcTxn } from "./types";

const t = (p: Partial<CalcTxn> & Pick<CalcTxn, "txn_type" | "amount_paise">): CalcTxn => ({
  id: Math.random().toString(), category: null, occurred_at: "2026-11-10T10:00:00Z", source_id: "a", to_source_id: null, ...p,
});

describe("money", () => {
  it("parses rupee input into integer paise", () => {
    expect(parseAmountToPaise("1,250.75")).toBe(125075);
    expect(parseAmountToPaise("₹ 450.5")).toBe(45050);
    expect(parseAmountToPaise("100")).toBe(10000);
    expect(parseAmountToPaise("1.234")).toBeNull();
    expect(parseAmountToPaise("abc")).toBeNull();
  });
  it("formats with Indian digit grouping and ₹", () => {
    expect(formatMoney(10000000)).toBe("₹1,00,000");
    expect(formatMoney(1000000000)).toBe("₹1,00,00,000");
    expect(formatMoney(12050)).toBe("₹120.50");
    expect(formatMoney(1000000, { decimals: "always" })).toBe("₹10,000.00");
  });
});

describe("engine", () => {
  it("excludes transfers from income and expenses", () => {
    const s = summarize([
      t({ txn_type: "income", amount_paise: 5000000 }),
      t({ txn_type: "expense", amount_paise: 120000 }),
      t({ txn_type: "transfer", amount_paise: 1000000, to_source_id: "b" }),
    ]);
    expect(s.incomePaise).toBe(5000000);
    expect(s.expensePaise).toBe(120000);
    expect(s.netPaise).toBe(4880000);
  });
  it("treats refunds as reduced spending, not income", () => {
    const s = summarize([
      t({ txn_type: "expense", amount_paise: 300000, category: "shopping" }),
      t({ txn_type: "refund", amount_paise: 100000, category: "shopping" }),
    ]);
    expect(s.incomePaise).toBe(0);
    expect(s.expensePaise).toBe(200000);
    expect(categoryBreakdown([
      t({ txn_type: "expense", amount_paise: 300000, category: "shopping" }),
      t({ txn_type: "refund", amount_paise: 100000, category: "shopping" }),
    ])[0]?.amountPaise).toBe(200000);
  });
  it("computes recorded source balances including transfers", () => {
    const b = sourceBalances(
      [{ id: "a", opening_balance_paise: 1000000 }, { id: "b", opening_balance_paise: 0 }],
      [
        t({ txn_type: "expense", amount_paise: 50000 }),
        t({ txn_type: "transfer", amount_paise: 200000, to_source_id: "b" }),
        t({ txn_type: "refund", amount_paise: 10000 }),
      ],
    );
    expect(b.get("a")).toBe(760000);
    expect(b.get("b")).toBe(200000);
  });
  it("category shares sum to ~100%", () => {
    const slices = categoryBreakdown([
      t({ txn_type: "expense", amount_paise: 100, category: "food" }),
      t({ txn_type: "expense", amount_paise: 300, category: "groceries" }),
    ]);
    expect(slices.map((s) => s.shareBp)).toEqual([7500, 2500]);
  });
  it("this month spans the calendar month", () => {
    const r = periodRange("month", new Date(2026, 10, 17));
    expect(r.start).toEqual(new Date(2026, 10, 1));
    expect(r.end).toEqual(new Date(2026, 11, 1));
    const w = periodRange("week", new Date(2026, 10, 17)); // Tuesday
    expect(w.start).toEqual(new Date(2026, 10, 16));
  });
});
