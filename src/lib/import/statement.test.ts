import { describe, expect, it } from "vitest";
import { detectColumns, extractMerchant, findDuplicates, guessDateOrder, normaliseRows, parseStatementAmount, parseStatementDate, suggestCategory } from "./statement";
import { checkStatementFile, readStatementCsv } from "./csv";

describe("dates", () => {
  it("reads Indian day-first formats", () => {
    expect(parseStatementDate("05/11/2026")).toEqual(new Date(2026, 10, 5));
    expect(parseStatementDate("05-11-26")).toEqual(new Date(2026, 10, 5));
    expect(parseStatementDate("05 Nov 2026")).toEqual(new Date(2026, 10, 5));
    expect(parseStatementDate("2026-11-05")).toEqual(new Date(2026, 10, 5));
  });
  it("rejects impossible dates", () => {
    expect(parseStatementDate("31/02/2026")).toBeNull();
    expect(parseStatementDate("hello")).toBeNull();
  });
});

describe("amounts", () => {
  it("reads Indian grouping, signs and Dr/Cr", () => {
    expect(parseStatementAmount("1,23,456.78")).toEqual({ paise: 12345678, sign: 0 });
    expect(parseStatementAmount("(500.00)")).toEqual({ paise: 50000, sign: -1 });
    expect(parseStatementAmount("750 Dr")).toEqual({ paise: 75000, sign: -1 });
    expect(parseStatementAmount("₹2,000 CR")).toEqual({ paise: 200000, sign: 1 });
    expect(parseStatementAmount("abc")).toBeNull();
  });
});

describe("rows", () => {
  const headers = ["Txn Date", "Narration", "Chq./Ref.No.", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"];
  it("detects common Indian bank columns", () => {
    expect(detectColumns(headers)).toEqual({ date: "Txn Date", description: "Narration", reference: "Chq./Ref.No.", debit: "Withdrawal Amt.", credit: "Deposit Amt.", balance: "Closing Balance" });
  });
  it("turns debit into expense and credit into income, flags bad rows", () => {
    const m = detectColumns(headers);
    const r = (d: string, n: string, w: string, dep: string) => ({ "Txn Date": d, Narration: n, "Chq./Ref.No.": "", "Withdrawal Amt.": w, "Deposit Amt.": dep, "Closing Balance": "" });
    const { valid, invalid } = normaliseRows([r("01/11/2026", "SALARY", "", "65,000.00"), r("02/11/2026", "SWIGGY", "450.50", ""), r("xx", "BAD", "1", ""), r("03/11/2026", "BOTH", "1", "1")], m);
    expect(valid.map((v) => [v.type, v.amountPaise])).toEqual([["income", 6500000], ["expense", 45050]]);
    expect(invalid.map((i) => i.row)).toEqual([3, 4]);
  });
});

describe("duplicates", () => {
  it("flags same-reference and same-day-amount matches for the same source only", () => {
    const rows = [
      { row: 1, date: new Date(2026, 10, 2), description: "SWIGGY", merchant: "Swiggy", amountPaise: 45050, type: "expense" as const, reference: "R1234567" },
      { row: 2, date: new Date(2026, 10, 3), description: "OLA", merchant: "Ola", amountPaise: 30000, type: "expense" as const, reference: null },
      { row: 3, date: new Date(2026, 10, 4), description: "NEW", merchant: null, amountPaise: 100, type: "expense" as const, reference: null },
    ];
    const existing = [
      { txn_type: "expense", amount_paise: 45050, occurred_at: new Date(2026, 10, 2, 9).toISOString(), source_id: "s", reference: "R1234567", description: "x" },
      { txn_type: "expense", amount_paise: 30000, occurred_at: new Date(2026, 10, 3, 9).toISOString(), source_id: "s", reference: null, description: "Ola cab" },
      { txn_type: "expense", amount_paise: 100, occurred_at: new Date(2026, 10, 4, 9).toISOString(), source_id: "other", reference: null, description: "Something else" },
    ];
    const d = findDuplicates(rows, existing, "s");
    expect(d.get(1)).toBe("exact");
    expect(d.get(2)).toBe("likely");
    expect(d.has(3)).toBe(false);
  });
  it("flags the same payment found in another source (e.g. GPay export vs bank statement)", () => {
    const rows = [{ row: 1, date: new Date(2026, 10, 2), description: "Paid to Swiggy", merchant: "Swiggy", amountPaise: 45050, type: "expense" as const, reference: null }];
    const existing = [{ txn_type: "expense", amount_paise: 45050, occurred_at: new Date(2026, 10, 2, 20).toISOString(), source_id: "bank", reference: null, description: "UPI/DR/412345678901/SWIGGY/YESB/swiggy@ybl" }];
    expect(findDuplicates(rows, existing, "gpay").get(1)).toBe("other_source");
  });
  it("flags rows repeated inside the same file", () => {
    const r = { date: new Date(2026, 10, 2), description: "OLA", merchant: "Ola", amountPaise: 30000, type: "expense" as const, reference: null };
    const d = findDuplicates([{ row: 1, ...r }, { row: 2, ...r }], [], "s");
    expect(d.has(1)).toBe(false);
    expect(d.get(2)).toBe("in_file");
  });
});

describe("categories", () => {
  it("suggests categories from merchant names", () => {
    expect(suggestCategory("UPI-SWIGGY-12345", "expense")).toBe("food");
    expect(suggestCategory("Zomato order", "expense")).toBe("food");
    expect(suggestCategory("AMAZON PAY INDIA", "expense")).toBe("shopping");
    expect(suggestCategory("Flipkart", "expense")).toBe("shopping");
    expect(suggestCategory("UBER INDIA", "expense")).toBe("transport");
    expect(suggestCategory("Ola ride", "expense")).toBe("transport");
    expect(suggestCategory("NETFLIX.COM", "expense")).toBe("subscriptions");
    expect(suggestCategory("Spotify India", "expense")).toBe("subscriptions");
    expect(suggestCategory("Electricity bill BESCOM", "expense")).toBe("utilities");
    expect(suggestCategory("NEFT SALARY ACME", "income")).toBe("salary");
  });
  it("leaves uncertain rows uncategorised instead of inventing a category", () => {
    expect(suggestCategory("RANDOM", "expense")).toBeNull();
    expect(suggestCategory("Paid to Ravi Kumar", "expense")).toBeNull();
    expect(suggestCategory("Payment from parent", "income")).toBeNull();
    expect(suggestCategory("Current account charges", "expense")).toBeNull(); // "rent" inside a word is not rent
  });
});

describe("merchants", () => {
  it("extracts merchant names from UPI narrations without guessing", () => {
    expect(extractMerchant("UPI/DR/412345678901/SWIGGY/YESB/swiggy@ybl/Payment")).toBe("Swiggy");
    expect(extractMerchant("UPI-RAVI KUMAR-ravi@okaxis-SBIN0001234-412345678901-NA")).toBe("Ravi Kumar");
    expect(extractMerchant("Paid to Sharma General Store")).toBe("Sharma General Store");
    expect(extractMerchant("CASH WITHDRAWAL")).toBeNull();
  });
});

describe("type and sign handling", () => {
  it("never confuses deposits with debits", () => {
    const m = { date: "Date", description: "Details", amount: "Amount", type: "Type" };
    const { valid, invalid } = normaliseRows([
      { Date: "01/11/2026", Details: "Cash deposit", Amount: "5,000", Type: "Deposit" },
      { Date: "02/11/2026", Details: "ATM", Amount: "2,000", Type: "DR" },
      { Date: "03/11/2026", Details: "Odd", Amount: "-100", Type: "CR" },
    ], m);
    expect(valid.map((v) => v.type)).toEqual(["income", "expense"]);
    expect(invalid[0]?.reason).toMatch(/opposite/);
  });
  it("reads Paytm-style signed amounts and marks refunds and self-transfers", () => {
    const m = { date: "Date", time: "Time", description: "Transaction Details", amount: "Amount" };
    const { valid } = normaliseRows([
      { Date: "05/11/2026", Time: "09:30 PM", "Transaction Details": "Paid to Zomato", Amount: "-450.00" },
      { Date: "06/11/2026", Time: "10:00", "Transaction Details": "Refund from Amazon", Amount: "+1,299" },
      { Date: "07/11/2026", Time: "10:00", "Transaction Details": "Self transfer to own account", Amount: "-10,000" },
    ], m);
    expect(valid[0]).toMatchObject({ type: "expense", amountPaise: 45000, merchant: "Zomato" });
    expect(valid[0]!.date).toEqual(new Date(2026, 10, 5, 21, 30));
    expect(valid[1]).toMatchObject({ type: "refund", amountPaise: 129900 });
    expect(valid[2]!.possibleTransfer).toBe(true);
  });
  it("guesses month-first dates only when the file proves it", () => {
    expect(guessDateOrder(["05/11/2026", "25/11/2026"])).toBe("dmy");
    expect(guessDateOrder(["11/25/2026"])).toBe("mdy");
    expect(guessDateOrder(["05/11/2026"])).toBe("dmy");
  });
});

describe("file reading", () => {
  it("rejects unsupported and empty files with a clear message", () => {
    expect(checkStatementFile({ name: "statement.pdf", size: 10, type: "application/pdf" })).toMatch(/PDF/);
    expect(checkStatementFile({ name: "statement.xlsx", size: 10, type: "" })).toMatch(/CSV/);
    expect(checkStatementFile({ name: "s.csv", size: 0, type: "text/csv" })).toMatch(/empty/);
    expect(checkStatementFile({ name: "s.csv", size: 100, type: "text/csv" })).toBeNull();
    expect(() => readStatementCsv("")).toThrow(/empty/);
    expect(() => readStatementCsv("Date,Narration,Amount\n")).toThrow(/no transaction rows/);
  });
  it("skips account-detail lines above the header and keeps misaligned rows as rejected", () => {
    const csv = "Account No: XXXX1234\nStatement period: Nov 2026\nDate,Narration,Withdrawal Amt.,Deposit Amt.\n01/11/2026,SWIGGY,450,\n02/11/2026,BAD,1,250.00,99\n";
    const r = readStatementCsv(csv);
    expect(r.headers).toEqual(["Date", "Narration", "Withdrawal Amt.", "Deposit Amt."]);
    const { valid, invalid } = normaliseRows(r.rows, r.mapping, "dmy", r.shapeErrors);
    expect(valid).toHaveLength(1);
    expect(invalid[0]?.reason).toMatch(/unquoted comma/);
  });
});
