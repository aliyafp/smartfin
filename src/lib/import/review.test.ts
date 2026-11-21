import { describe, expect, it } from "vitest";
import { buildReview, reviewTotals, toPayload, withType } from "./review";
import type { ParsedRow } from "./statement";

const row = (p: Partial<ParsedRow> & Pick<ParsedRow, "row" | "type" | "amountPaise">): ParsedRow => ({
  date: new Date(2026, 10, p.row), description: "Something", merchant: null, reference: null, account: null, possibleTransfer: false, ...p,
});

describe("import review", () => {
  const valid = [
    row({ row: 1, type: "income", amountPaise: 6500000, description: "NEFT SALARY ACME" }),
    row({ row: 2, type: "expense", amountPaise: 45000, description: "UPI/SWIGGY", merchant: "Swiggy" }),
    row({ row: 3, type: "refund", amountPaise: 5000, description: "Refund Swiggy", merchant: "Swiggy" }),
    row({ row: 4, type: "expense", amountPaise: 1000000, description: "Self transfer", possibleTransfer: true }),
    row({ row: 5, type: "expense", amountPaise: 30000, description: "Paid to Ravi" }),
  ];
  const existing = [{ txn_type: "expense", amount_paise: 45000, occurred_at: new Date(2026, 10, 2, 9).toISOString(), source_id: "s", reference: null, description: "UPI/SWIGGY" }];
  const rows = buildReview(valid, existing, "s");

  it("leaves duplicates and possible transfers unticked for the user to decide", () => {
    expect(rows.map((r) => r.include)).toEqual([true, false, true, false, true]);
    expect(rows[1]!.dup).toBe("exact");
  });
  it("categorises known merchants and leaves the rest uncategorised", () => {
    expect(rows.map((r) => r.category)).toEqual(["salary", "food", "food", null, null]);
  });
  it("totals only selected rows; refunds reduce expenses and never add to income", () => {
    const t = reviewTotals(rows, 2);
    expect(t).toMatchObject({ total: 7, valid: 5, invalid: 2, duplicates: 1, transfers: 1, selected: 3, incomePaise: 6500000, expensePaise: 30000 - 5000, refundPaise: 5000, uncategorised: 1 });
  });
  it("sends only selected rows to be saved", () => {
    expect(toPayload(rows).map((p) => p.amount_paise)).toEqual([6500000, 5000, 30000]);
  });
  it("re-suggests categories when the type changes", () => {
    expect(withType(rows[0]!, "expense").category).toBeNull();
  });
});
