import { describe, expect, it } from "vitest";
import { f, groceryReceipt, raw, upiSuccess } from "./__fixtures__/raw";
import { normaliseExtraction, parseDocumentDate, parseDocumentTime, parseIndianAmount, primaryAmount, scrubText } from "./normalise";
import { interpret } from "./interpret";
import { checkAmounts, checkDate, checkQuality, hasBlockingError, runChecks } from "./validate";
import { suggestItemCategory, suggestScanCategory } from "./categorise";
import { findScanDuplicates, type ExistingForDup } from "./duplicates";
import { buildSavePayload, initialForm, initialItems } from "./review";

const N = (r: Parameters<typeof normaliseExtraction>[0]) => normaliseExtraction(r);

describe("Indian amounts, dates and times", () => {
  it("parses rupee amounts with Indian digit grouping into paise", () => {
    expect(parseIndianAmount("₹1,23,456.50")).toBe(12345650);
    expect(parseIndianAmount("Rs. 450/-")).toBe(45000);
    expect(parseIndianAmount("INR 2,500")).toBe(250000);
    expect(parseIndianAmount("-₹45.00")).toBe(4500);
    expect(parseIndianAmount("abc")).toBeNull();
    expect(parseIndianAmount("12.345")).toBeNull();
  });
  it("reads numeric dates day-first and flags ambiguous ones instead of guessing silently", () => {
    expect(parseDocumentDate("04/05/2026")).toEqual({ iso: "2026-05-04", ambiguous: true, alternative: "2026-04-05", invalid: false });
    expect(parseDocumentDate("13/05/2026")).toMatchObject({ iso: "2026-05-13", ambiguous: false });
    expect(parseDocumentDate("18 Nov 2026")).toMatchObject({ iso: "2026-11-18", ambiguous: false });
    expect(parseDocumentDate("Nov 18, 2026")).toMatchObject({ iso: "2026-11-18" });
    expect(parseDocumentDate("31/02/2026")).toMatchObject({ iso: null, invalid: true });
  });
  it("reads 12h and 24h times", () => {
    expect(parseDocumentTime("7:42 PM")).toBe("19:42");
    expect(parseDocumentTime("12:05 am")).toBe("00:05");
    expect(parseDocumentTime("18:30:12")).toBe("18:30");
  });
});

describe("privacy", () => {
  it("never keeps OTPs, PINs, CVVs or full card numbers", () => {
    expect(scrubText("Your OTP is 482913")).toBe("Your OTP [removed]");
    expect(scrubText("UPI PIN: 1234")).toBe("UPI PIN [removed]");
    expect(scrubText("Card 4111 1111 1111 1234")).toBe("Card XXXX1234");
    const n = N(raw({ fields: { description: f("CVV 123 for card") } }));
    expect(n.description.value).not.toContain("123 ");
  });
});

describe("financial interpretation", () => {
  it("UPI successful payment → completed expense", () => {
    const i = interpret(N(upiSuccess));
    expect(i).toMatchObject({ state: "completed_expense", txnType: "expense", savable: true });
  });
  it("UPI failed payment → failed, never saved as spending", () => {
    const i = interpret(N(raw({ status_text: "Transaction Failed", status: "failed", direction: "paid_out", fields: { amount: f("₹450") } })));
    expect(i).toMatchObject({ state: "failed_payment", txnType: null, savable: false });
  });
  it("UPI pending payment → pending, not a confirmed expense", () => {
    const i = interpret(N(raw({ status_text: "Payment pending", status: "pending", direction: "paid_out" })));
    expect(i).toMatchObject({ state: "pending_payment", savable: false });
  });
  it("printed failure wins even if the model summarised it as success", () => {
    expect(interpret(N(raw({ status_text: "Payment failed", status: "success", direction: "paid_out" }))).state).toBe("failed_payment");
  });
  it("a green tick without status text is not proof of payment", () => {
    const i = interpret(N(raw({ status_text: null, status: "success", direction: "paid_out", fields: { amount: f("₹450") } })));
    expect(i).toMatchObject({ state: "unknown", savable: false, needsConfirmation: true });
  });
  it("bank debit → expense; bank credit → income that needs confirmation", () => {
    expect(interpret(N(raw({ document_type: "bank_debit", status_text: "Debited", status: "success" })))).toMatchObject({ state: "completed_expense", txnType: "expense" });
    expect(interpret(N(raw({ document_type: "bank_credit", status_text: "Credited", status: "success" })))).toMatchObject({ state: "completed_income", txnType: "income", needsConfirmation: true });
  });
  it("refund is a refund, not income", () => {
    const i = interpret(N(raw({ document_type: "refund_confirmation", status_text: "Refund successful", status: "success", direction: "received" })));
    expect(i).toMatchObject({ state: "refund", txnType: "refund", savable: true });
  });
  it("money moved to your own account is a transfer", () => {
    const i = interpret(N(raw({ document_type: "upi_payment", status_text: "Sent", status: "success", direction: "paid_out", counterparty_is_own_account: true })));
    expect(i).toMatchObject({ state: "transfer", txnType: "transfer" });
  });
  it("paid receipt → expense; unpaid invoice → unpaid, not spending", () => {
    expect(interpret(N(groceryReceipt))).toMatchObject({ state: "completed_expense", needsConfirmation: false });
    expect(interpret(N(raw({ document_type: "online_invoice", payment_state_on_document: "unpaid_or_due", amounts: { total: f("₹1,499") } })))).toMatchObject({ state: "unpaid_invoice", savable: false });
    expect(interpret(N(raw({ document_type: "utility_bill", amounts: { total: f("₹1,240") } })))).toMatchObject({ state: "unpaid_invoice" });
  });
  it("low classification confidence asks the user to choose the document type", () => {
    expect(interpret(N(raw({ document_type: "retail_receipt", classification_confidence: "low" })))).toMatchObject({ needsTypeChoice: true, needsConfirmation: true });
  });
});

describe("multi-item grocery receipt", () => {
  const n = N(groceryReceipt);
  it("keeps every item separately with original names", () => {
    expect(n.items.map((i) => [i.originalName, i.lineTotalPaise])).toEqual([["Rice 1kg", 12000], ["Milk 1L", 6000], ["Soap", 4500], ["Bread", 4000]]);
    expect(n.merchant.value).toBe("FRESHMART SUPERMARKET PVT LTD");
    expect(n.merchantNormalised).toBe("Freshmart Supermarket");
  });
  it("items reconcile with the subtotal and total", () => {
    const c = checkAmounts(n, primaryAmount(n));
    expect(c.find((x) => x.id === "items_subtotal")?.level).toBe("ok");
    expect(c.find((x) => x.id === "bill_total")?.level).toBe("ok");
  });
  it("is saved as ONE ₹265 transaction with 4 items attached", () => {
    const i = interpret(n);
    const form = { ...initialForm(n, i, suggestScanCategory({ merchant: n.merchantNormalised, description: null, documentType: n.documentType, txnType: i.txnType, items: [] })) };
    const res = buildSavePayload(form, initialItems(n));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.payload.txn.amount_paise).toBe(26500);
    expect(res.payload.txn.txn_type).toBe("expense");
    expect(res.payload.items).toHaveLength(4);
  });
  it("suggests groceries for the parent and per-item categories", () => {
    expect(suggestScanCategory({ merchant: "Freshmart", description: null, documentType: "grocery_receipt", txnType: "expense", items: n.items.map((i) => ({ name: i.originalName, lineTotalPaise: i.lineTotalPaise })) }).category).toBe("groceries");
    expect(suggestItemCategory("Milk 1L").category).toBe("groceries");
    expect(suggestItemCategory("Soap").category).toBe("household");
  });
  it("user rules win over built-in suggestions", () => {
    expect(suggestScanCategory({ merchant: "Freshmart", description: null, documentType: "grocery_receipt", txnType: "expense", items: [] }, [{ pattern: "freshmart", match_field: "merchant", category: "household" }])).toMatchObject({ category: "household", source: "your_rule" });
  });
  it("known merchants map to app categories", () => {
    const s = (m: string) => suggestScanCategory({ merchant: m, description: null, documentType: "upi_payment", txnType: "expense", items: [] }).category;
    expect(s("Swiggy")).toBe("food");
    expect(s("Uber India")).toBe("transport");
    expect(s("Netflix")).toBe("subscriptions");
  });
});

describe("GST, discount and reconciliation", () => {
  it("accepts GST added on top (exclusive)", () => {
    const n = N(raw({ document_type: "restaurant_receipt", amounts: { subtotal: f("1,000.00"), gst_rate: f("5%"), gst_amount: f("50.00"), total: f("1,050.00") } }));
    const c = checkAmounts(n, primaryAmount(n));
    expect(c.find((x) => x.id === "gst")?.level).toBe("ok");
    expect(c.find((x) => x.id === "bill_total")?.level).toBe("ok");
  });
  it("accepts GST included in prices", () => {
    const n = N(raw({ document_type: "retail_receipt", amounts: { subtotal: f("1,180.00"), gst_rate: f("18%"), gst_amount: f("180.00"), total: f("1,180.00") } }));
    const c = checkAmounts(n, primaryAmount(n));
    expect(c.find((x) => x.id === "gst")?.level).toBe("ok");
    expect(c.find((x) => x.id === "bill_total")?.level).toBe("ok");
  });
  it("applies discounts and charges", () => {
    const n = N(raw({ document_type: "restaurant_receipt", amounts: { subtotal: f("500.00"), discount: f("-50.00"), gst_amount: f("22.50"), delivery_fee: f("30.00"), packaging_fee: f("15.00"), round_off: f("+0.50"), total: f("518.00") } }));
    expect(checkAmounts(n, primaryAmount(n)).find((x) => x.id === "bill_total")?.level).toBe("ok");
  });
  it("tolerates up to ₹1 rounding but flags real mismatches without changing values", () => {
    const ok = N(raw({ amounts: { subtotal: f("99.40"), total: f("100.00") } }));
    expect(checkAmounts(ok, primaryAmount(ok)).find((x) => x.id === "bill_total")?.level).toBe("ok");
    const bad = N(raw({ amounts: { subtotal: f("265.00"), total: f("285.00") } }));
    expect(checkAmounts(bad, primaryAmount(bad)).find((x) => x.id === "bill_total")?.level).toBe("warning");
    expect(bad.total.value).toBe(28500);
  });
  it("flags a GST amount that doesn't match its rate", () => {
    const n = N(raw({ amounts: { subtotal: f("1,000.00"), gst_rate: f("18%"), gst_amount: f("50.00"), total: f("1,050.00") } }));
    expect(checkAmounts(n, primaryAmount(n)).find((x) => x.id === "gst")?.level).toBe("warning");
  });
  it("records the amount paid when it differs from the bill", () => {
    const n = N(raw({ document_type: "online_invoice", payment_state_on_document: "paid", amounts: { total: f("₹1,499.00"), amount_paid: f("₹1,299.00") } }));
    expect(primaryAmount(n)).toBe(129900);
    expect(checkAmounts(n, primaryAmount(n)).find((x) => x.id === "paid_vs_total")?.level).toBe("info");
  });
});

describe("quality, missing values and dates", () => {
  it("poor image → warning; unreadable → error", () => {
    expect(checkQuality({ imageQuality: "poor", readableText: true })[0]?.level).toBe("warning");
    expect(checkQuality({ imageQuality: "unreadable", readableText: false })[0]?.level).toBe("error");
  });
  it("missing amount blocks saving", () => {
    const n = N(raw({ document_type: "retail_receipt" }));
    const checks = runChecks(n, { amountPaise: primaryAmount(n), dateIso: null });
    expect(hasBlockingError(checks)).toBe(true);
    const form = initialForm(n, interpret(n), { category: null, confidence: "low", source: null });
    const res = buildSavePayload({ ...form, date: "2026-11-18" }, []);
    expect(res.ok).toBe(false);
  });
  it("flags missing, ambiguous and future dates", () => {
    const amb = N(raw({ fields: { date: f("04/05/2026") } }));
    expect(checkDate(amb.date.value, amb).map((c) => c.id)).toContain("date_ambiguous");
    expect(checkDate(null, N(raw())).map((c) => c.id)).toEqual(["date_missing"]);
    const fut = N(raw({ fields: { date: f("01 Jan 2099") } }));
    expect(checkDate(fut.date.value, fut, new Date("2026-11-19")).map((c) => c.id)).toContain("date_future");
  });
});

describe("duplicate detection", () => {
  const existing: ExistingForDup[] = [
    { id: "t1", txn_type: "expense", amount_paise: 45000, occurred_at: "2026-11-18T14:12:00.000Z", reference: "432109876543", description: "Sharma General Store", merchant: "Sharma General Store" },
    { id: "t2", txn_type: "expense", amount_paise: 26500, occurred_at: "2026-11-12T06:30:00.000Z", reference: null, description: "Freshmart Supermarket", merchant: "Freshmart Supermarket" },
  ];
  it("prioritises an exact reference match", () => {
    const m = findScanDuplicates({ reference: "UPI Ref No: 432109876543", receiptNumber: null, merchant: "Someone else", description: null, amountPaise: 1, dateIso: "2026-01-01", txnType: "expense" }, existing);
    expect(m[0]).toMatchObject({ id: "t1", kind: "reference" });
  });
  it("matches merchant + date + amount when there is no reference", () => {
    const m = findScanDuplicates({ reference: null, receiptNumber: null, merchant: "Freshmart Supermarket", description: null, amountPaise: 26500, dateIso: "2026-11-12", txnType: "expense" }, existing);
    expect(m[0]).toMatchObject({ id: "t2", kind: "same_details" });
  });
  it("doesn't flag a different amount", () => {
    expect(findScanDuplicates({ reference: null, receiptNumber: null, merchant: "Freshmart Supermarket", description: null, amountPaise: 26600, dateIso: "2026-11-12", txnType: "expense" }, existing)).toEqual([]);
  });
});

describe("incorrect extraction is correctable", () => {
  it("user corrections replace misread values in the saved transaction", () => {
    const n = N(raw({ document_type: "retail_receipt", payment_state_on_document: "paid", fields: { merchant_name: f("Croma", "low"), date: f("18 Nov 2026") }, amounts: { total: f("₹4,999") } }));
    const form = initialForm(n, interpret(n), { category: "shopping", confidence: "high", source: "merchant" });
    expect(form.amount).toBe("4999");
    const res = buildSavePayload({ ...form, amount: "5,999", merchant: "Croma Electronics" }, []);
    expect(res.ok && res.payload.txn).toMatchObject({ amount_paise: 599900, description: "Croma Electronics" });
  });
});

describe("references", () => {
  it("keeps only the identifier from printed reference labels", () => {
    const n = N(raw({ fields: { reference_number: f("UPI Ref No: 432109876543"), receipt_number: f("Invoice No. INV-20931") } }));
    expect(n.reference.value).toBe("432109876543");
    expect(n.receiptNumber.value).toBe("INV-20931");
  });
});

describe("split GST and other taxes", () => {
  it("adds CGST + SGST lines and combined rates, so the bill reconciles", () => {
    const n = N(raw({ document_type: "restaurant_receipt", amounts: { subtotal: f("1,000.00"), discount: f("-100.00"), cgst: f("22.50"), sgst: f("22.50"), gst_rate: f("CGST 2.5% + SGST 2.5%"), total: f("₹945.00") } }));
    expect(n.gstAmount.value).toBe(4500);
    expect(n.gstRate.value).toBe(5);
    expect(N(raw({ amounts: { gst_rate: f("CGST @2.5%\nSGST @2.5%") } })).gstRate.value).toBe(5);
    const c = checkAmounts(n, primaryAmount(n));
    expect(c.find((x) => x.id === "bill_total")?.level).toBe("ok");
    expect(c.find((x) => x.id === "gst")?.level).toBe("ok");
  });
  it("counts non-GST duties in the total", () => {
    const n = N(raw({ document_type: "utility_bill", items: [{ name: "Energy charges", quantity: null, unit_price: null, line_total: "1,092.00", confidence: "high" }, { name: "Fixed charges", quantity: null, unit_price: null, line_total: "128.00", confidence: "high" }], amounts: { other_taxes: f("20.00"), total: f("₹1,240.00") } }));
    expect(checkAmounts(n, primaryAmount(n)).find((x) => x.id === "bill_total")?.level).toBe("ok");
  });
});

describe("robustness", () => {
  it("handles readings saved before new fields existed", () => {
    const old = raw({ amounts: { total: f("₹100") } }) as unknown as { amounts: Record<string, unknown> };
    delete old.amounts["cgst"]; delete old.amounts["other_taxes"];
    expect(N(old as unknown as Parameters<typeof normaliseExtraction>[0]).total.value).toBe(10000);
  });
});

describe("restaurant items", () => {
  it("dishes on a restaurant bill are food, even if a word looks like a grocery", () => {
    expect(suggestItemCategory("Paneer Tikka", [], "restaurant_receipt").category).toBe("food");
    expect(suggestItemCategory("Paneer 200g", [], "grocery_receipt").category).toBe("groceries");
  });
});
