import { describe, expect, it } from "vitest";
import { PROVIDERS, canConnect, getProvider, searchProviders, sectionOf, sourceGroupOf } from "./providers";
import { getAdapter, isUnsupported } from "./adapters";
import { parseGooglePayExport } from "./adapters/google-pay";
import { parsePaytmStatement } from "./adapters/paytm";
import { parseAmazonOrders } from "./adapters/amazon";
import { recordsFromPdf } from "./adapters/statement-pdf";
import { parseTimestamp } from "./adapters/common";
import { connectionCanSync, interpretRecord } from "./engine/interpret";
import { canonicalMerchant } from "./engine/merchant";
import { buildConnectReview, reviewCounts, toIngestGroups } from "./engine/review";
import { ExportFileError, type SourceRecord } from "./types";

const gpayHtml = (entries: { title: string; time: string; details: string }[]) =>
  `<html><body>${entries.map((e) => `<div class="outer-cell mdl-cell"><div class="mdl-grid"><div class="header-cell"><p>Google Pay<br></p></div><div class="content-cell mdl-cell--6-col">${e.title}<br>${e.time}<br></div><div class="content-cell mdl-cell--6-col mdl-typography--text-right"></div><div class="content-cell mdl-typography--caption"><b>Products:</b><br>&emsp;Google Pay<br><b>Details:</b><br>&emsp;${e.details}<br></div></div></div>`).join("")}</body></html>`;

describe("provider registry", () => {
  it("only lets available providers with a method connect", () => {
    expect(canConnect(getProvider("google_pay")!)).toBe(true);
    expect(canConnect(getProvider("amazon")!, "file_export")).toBe(true);
    for (const id of ["swiggy", "zomato", "uber", "ola", "flipkart", "blinkit", "netflix", "spotify", "gmail", "account_aggregator"]) {
      expect(canConnect(getProvider(id)!)).toBe(false);
    }
  });
  it("every unavailable provider explains why", () => {
    for (const p of PROVIDERS.filter((x) => x.status !== "available")) expect(p.statusNote?.length).toBeGreaterThan(10);
  });
  it("puts approval-gated providers in their own section", () => {
    expect(sectionOf(getProvider("uber")!)).toBe("approval");
    expect(sectionOf(getProvider("ola")!)).toBe("approval");
    expect(sectionOf(getProvider("blinkit")!)).toBe("unavailable");
    expect(sectionOf(getProvider("paytm")!)).toBe("available");
  });
  it("searches by name and alias within a filter", () => {
    expect(searchProviders(PROVIDERS, "gpay", "all").map((p) => p.id)).toEqual(["google_pay"]);
    expect(searchProviders(PROVIDERS, "", "transport").map((p) => p.id)).toEqual(["uber", "ola"]);
  });
  it("unsupported adapters refuse instead of pretending", () => {
    const r = getAdapter("swiggy").parseExport({ fileName: "x.csv", text: "a" });
    expect(isUnsupported(r)).toBe(true);
    expect(getAdapter("amazon").fetchHistoricalRecords().ok).toBe(false);
  });
  it("groups transactions by source for filtering", () => {
    expect(sourceGroupOf({ provider_id: "paytm", entry_method: "connected" })).toBe("payments");
    expect(sourceGroupOf({ provider_id: "amazon", entry_method: "connected" })).toBe("shopping");
    expect(sourceGroupOf({ provider_id: null, entry_method: "manual" })).toBe("manual");
    expect(sourceGroupOf({ provider_id: null, entry_method: "csv" })).toBe("banks");
  });
});

describe("timestamps", () => {
  it("reads Google formats as India time unless a zone is given", () => {
    expect(parseTimestamp("Jan 5, 2026, 1:23:45 PM IST")!.toISOString()).toBe("2026-01-05T07:53:45.000Z");
    expect(parseTimestamp("5 Jan 2026, 13:23:45 GMT+05:30")!.toISOString()).toBe("2026-01-05T07:53:45.000Z");
    expect(parseTimestamp("2026-01-05T07:53:45.000Z")!.toISOString()).toBe("2026-01-05T07:53:45.000Z");
    expect(parseTimestamp("yesterday")).toBeNull();
  });
});

describe("Google Pay Takeout", () => {
  const html = gpayHtml([
    { title: "Paid ₹250.00 to Zomato using Bank Account XXXXXX1234", time: "Mar 3, 2026, 8:15:00 PM IST", details: "Completed" },
    { title: "Received ₹1,000.00 from Asha Verma", time: "Mar 2, 2026, 9:00:00 AM IST", details: "Completed" },
    { title: "Paid ₹499.00 to Fictional Store", time: "Mar 1, 2026, 10:00:00 AM IST", details: "Failed" },
    { title: "Requested ₹300.00 from Ravi", time: "Mar 1, 2026, 11:00:00 AM IST", details: "Pending" },
    { title: "Something unreadable", time: "Mar 1, 2026, 11:00:00 AM IST", details: "Completed" },
  ]);
  it("reads payments, keeps statuses and ignores requests", () => {
    const r = parseGooglePayExport("My Activity.html", html);
    expect(r.records).toHaveLength(3);
    expect(r.records[0]).toMatchObject({ amountPaise: 25000, direction: "debit", status: "success", merchantRaw: "Zomato" });
    expect(r.records[1]).toMatchObject({ amountPaise: 100000, direction: "credit" });
    expect(r.records[2]!.status).toBe("failed");
    expect(r.ignored).toHaveLength(1);
    expect(r.rejected).toHaveLength(1);
  });
  it("gives the same id to the same entry every time", () => {
    expect(parseGooglePayExport("a.html", html).records[0]!.providerRecordId).toBe(parseGooglePayExport("b.html", html).records[0]!.providerRecordId);
  });
  it("reads the JSON variant", () => {
    const json = JSON.stringify([{ header: "Google Pay", title: "Paid ₹120.50 to Chai Point", time: "2026-03-04T05:00:00.000Z", details: [{ name: "Completed" }] }]);
    const r = parseGooglePayExport("My Activity.json", json);
    expect(r.records[0]).toMatchObject({ amountPaise: 12050, status: "success" });
  });
  it("rejects empty and unrelated files with a clear message", () => {
    expect(() => parseGooglePayExport("x.html", "")).toThrow(ExportFileError);
    expect(() => parseGooglePayExport("x.html", "<html><body>hello</body></html>")).toThrow(/No Google Pay activity/);
  });
});

describe("Paytm statement", () => {
  const rows = [
    ["Paytm UPI Statement for 01 Mar 2026 - 31 Mar 2026"],
    ["Date", "Time", "Transaction Details", "Other Transaction Details (UPI ID or A/c No)", "Your Account", "Amount", "UPI Ref No.", "Order ID", "Remarks", "Tags", "Comment"],
    ["05/03/2026", "19:20:00", "Paid to Swiggy", "swiggy@icici", "HDFC Bank - 12", "-Rs.420.00", "406512345678", "", "", "#Food", ""],
    ["06/03/2026", "10:00:00", "Received from Neha Kapoor", "neha@okaxis", "HDFC Bank - 12", "+ Rs. 2,000.00", "406512345679", "", "", "", ""],
    ["07/03/2026", "12:00:00", "Money sent to self", "", "HDFC Bank - 12", "-Rs.5,000.00", "406512345680", "", "Self transfer", "", ""],
    ["08/03/2026", "12:00:00", "Refund from Fictional Mart", "", "HDFC Bank - 12", "+Rs.150.00", "406512345681", "", "", "", ""],
    ["bad date", "", "Paid to X", "", "", "-Rs.10", "", "", "", "", ""],
  ];
  it("reads debits, credits, transfers and refunds", () => {
    const r = parsePaytmStatement(rows);
    expect(r.records.map((x) => [x.recordType, x.direction, x.amountPaise])).toEqual([
      ["payment", "debit", 42000], ["payment", "credit", 200000], ["transfer", "debit", 500000], ["refund", "credit", 15000],
    ]);
    expect(r.records[0]!.reference).toBe("406512345678");
    expect(r.rejected).toEqual([{ row: 7, reason: "Date couldn't be read" }]);
  });
  it("refuses a sheet without the Paytm columns", () => {
    expect(() => parsePaytmStatement([["Foo", "Bar"], ["1", "2"]])).toThrow(ExportFileError);
  });
});

describe("Amazon order history", () => {
  const csv = [
    "Website,Order ID,Order Date,Currency,Unit Price,Total Owed,Quantity,Payment Instrument Type,Order Status,Product Name",
    'Amazon.in,402-1111111-1111111,2026-03-05T06:30:00Z,INR,999,"1,049.00",1,UPI,Closed,Fictional Steel Bottle',
    "Amazon.in,402-1111111-1111111,2026-03-05T06:30:00Z,INR,450,450.00,1,UPI,Closed,Fictional Notebook Pack",
    "Amazon.in,402-2222222-2222222,2026-03-06T06:30:00Z,INR,300,300.00,1,UPI,Cancelled,Fictional Cable",
    "Amazon.com,111-3333333-3333333,2026-03-07T06:30:00Z,USD,20,20.00,1,Visa,Closed,Fictional Book",
  ].join("\n");
  it("groups item rows into one order with items", () => {
    const r = parseAmazonOrders(csv);
    const order = r.records.find((x) => x.orderId === "402-1111111-1111111")!;
    expect(order.amountPaise).toBe(149900);
    expect(order.items.map((i) => i.name)).toEqual(["Fictional Steel Bottle", "Fictional Notebook Pack"]);
    expect(order.recordType).toBe("order");
  });
  it("marks fully cancelled orders as cancellations and rejects non-INR", () => {
    const r = parseAmazonOrders(csv);
    expect(r.records.find((x) => x.orderId === "402-2222222-2222222")!.recordType).toBe("cancellation");
    expect(r.rejected[0]!.reason).toMatch(/USD/);
  });
  it("refuses other Amazon files", () => {
    expect(() => parseAmazonOrders("Return ID,Return Amount\n1,2")).toThrow(/order history/);
  });
});

describe("statement PDF rows", () => {
  it("converts AI rows and rejects incomplete ones", () => {
    const r = recordsFromPdf("phonepe", { is_statement: true, provider_seen: "PhonePe", rows: [
      { date: "Mar 09, 2026", time: "08:10 pm", description: "Paid to Fictional Cafe", counterparty: "Fictional Cafe", direction: "debit", amount: "₹180", status: "success", reference: "T2603091234" },
      { date: "Mar 09, 2026", time: null, description: "Paid to X", counterparty: null, direction: "unknown", amount: "50", status: "success", reference: null },
    ] });
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toMatchObject({ providerId: "phonepe", amountPaise: 18000, providerRecordId: "ref:T2603091234" });
    expect(r.rejected).toHaveLength(1);
  });
});

const rec = (o: Partial<SourceRecord>): SourceRecord => ({
  providerId: "google_pay", providerRecordId: Math.random().toString(36), recordType: "payment", status: "success", direction: "debit",
  amountPaise: 10000, occurredAt: "2026-03-05T08:00:00.000Z", description: "Paid ₹100 to Someone", merchantRaw: "Someone", reference: null,
  orderId: null, paymentMethod: "UPI", items: [], row: 1, ...o,
});

describe("status interpretation", () => {
  it.each([
    [{ status: "success", direction: "debit" }, "expense"],
    [{ status: "success", direction: "credit" }, "income"],
    [{ recordType: "refund", direction: "credit" }, "refund"],
    [{ status: "failed" }, "not_counted"],
    [{ status: "pending" }, "not_counted"],
    [{ recordType: "cancellation", status: "cancelled" }, "not_counted"],
    [{ recordType: "transfer" }, "not_counted"],
    [{ recordType: "order", status: "pending" }, "not_counted"],
  ] as const)("%o → %s", (o, effect) => {
    expect(interpretRecord(rec(o as Partial<SourceRecord>)).effect).toBe(effect);
  });
  it("refunds are never income", () => {
    expect(interpretRecord(rec({ recordType: "refund", direction: "credit" })).txnType).toBe("refund");
  });
  it("unknown status needs review", () => {
    expect(interpretRecord(rec({ status: "unknown" })).needsReview).toBe(true);
  });
  it("only active connections can sync", () => {
    expect(connectionCanSync("active")).toBe(true);
    expect(connectionCanSync("revoked")).toBe(false);
    expect(connectionCanSync("paused")).toBe(false);
  });
});

describe("merchant normalisation", () => {
  it.each([["ZOMATO ONLINE", "Zomato"], ["Zomato Ltd", "Zomato"], ["Paid to Zomato", "Zomato"], ["Amazon Seller Services Pvt Ltd", "Amazon"]])("%s → %s", (raw, out) => {
    expect(canonicalMerchant(raw)).toBe(out);
  });
});

describe("cross-source matching", () => {
  const bankDebit = { id: "t-bank", txn_type: "expense", amount_paise: 149900, occurred_at: "2026-03-05T09:00:00.000Z", merchant: null, description: "UPI/AMAZON PAY/402111", reference: null, provider_id: null };

  it("an Amazon order, its Google Pay payment and the bank debit count once", () => {
    const gpay = rec({ providerRecordId: "g1", amountPaise: 149900, merchantRaw: "Amazon", description: "Paid ₹1,499.00 to Amazon" });
    const r1 = buildConnectReview({ format: "", records: [gpay], rejected: [], ignored: [], total: 1 }, { existingTxns: [bankDebit], existingRecordIds: new Set() });
    expect(r1.rows[0]).toMatchObject({ action: "link", match: { txnId: "t-bank", strength: "strong" } });

    const order = rec({ providerId: "amazon", providerRecordId: "order:402-1", recordType: "order", amountPaise: 149900, merchantRaw: "Amazon", description: "Amazon: Fictional Steel Bottle", occurredAt: "2026-03-05T06:30:00.000Z" });
    const linked = new Map([["t-bank", new Set(["google_pay"])]]);
    const r2 = buildConnectReview({ format: "", records: [order], rejected: [], ignored: [], total: 1 }, { existingTxns: [bankDebit], existingRecordIds: new Set(), linkedProviders: linked });
    expect(r2.rows[0]).toMatchObject({ action: "link", match: { txnId: "t-bank" } });
    const counts = reviewCounts(r2);
    expect(counts.create).toBe(0);
    expect(counts.expensePaise).toBe(0);
  });

  it("matches on reference number first", () => {
    const r = buildConnectReview({ format: "", records: [rec({ reference: "406512345678", amountPaise: 99 })] , rejected: [], ignored: [], total: 1 }, {
      existingTxns: [{ ...bankDebit, id: "t2", amount_paise: 12345, reference: "406512345678" }], existingRecordIds: new Set(),
    });
    expect(r.rows[0]!.match).toMatchObject({ txnId: "t2", score: 100 });
  });

  it("same amount and day but a different merchant is only a possible match", () => {
    const r = buildConnectReview({ format: "", records: [rec({ amountPaise: 149900, merchantRaw: "Corner Bakery" })], rejected: [], ignored: [], total: 1 }, { existingTxns: [bankDebit], existingRecordIds: new Set() });
    expect(r.rows[0]).toMatchObject({ action: "create", match: { strength: "possible" } });
  });

  it("two records from the same provider are never merged", () => {
    const r = buildConnectReview({ format: "", records: [rec({ amountPaise: 149900, merchantRaw: "Amazon" })], rejected: [], ignored: [], total: 1 }, {
      existingTxns: [{ ...bankDebit, provider_id: "google_pay", merchant: "Amazon" }], existingRecordIds: new Set(),
    });
    expect(r.rows[0]!.match).toBeNull();
  });

  it("already-imported and repeated rows are counted, not re-imported", () => {
    const a = rec({ providerRecordId: "same" });
    const r = buildConnectReview({ format: "", records: [a, { ...a }, rec({ providerRecordId: "old" })], rejected: [], ignored: [], total: 3 }, { existingTxns: [], existingRecordIds: new Set(["old"]) });
    expect(r.rows).toHaveLength(1);
    expect(r.alreadyImported).toBe(1);
    expect(r.repeatedInFile).toBe(1);
  });

  it("failed and cancelled records are stored for history but never become transactions", () => {
    const r = buildConnectReview({ format: "", records: [rec({ providerRecordId: "f", status: "failed" }), rec({ providerRecordId: "c", recordType: "cancellation", status: "cancelled", providerId: "amazon" })], rejected: [], ignored: [], total: 2 }, { existingTxns: [], existingRecordIds: new Set() });
    const groups = toIngestGroups(r.rows);
    expect(groups.map((g) => g.action)).toEqual(["record_only", "record_only"]);
    expect(groups.every((g) => !g.txn)).toBe(true);
  });

  it("orders keep their items as details of one transaction", () => {
    const order = rec({ providerId: "amazon", providerRecordId: "order:9", recordType: "order", amountPaise: 50000, description: "Amazon: Fictional Lamp +1 more", items: [{ name: "Fictional Lamp", quantity: 1, lineTotalPaise: 30000 }, { name: "Bulb", quantity: 2, lineTotalPaise: 20000 }] });
    const [g] = toIngestGroups(buildConnectReview({ format: "", records: [order], rejected: [], ignored: [], total: 1 }, { existingTxns: [], existingRecordIds: new Set() }).rows);
    expect(g!.action).toBe("create");
    expect(g!.txn).toMatchObject({ txn_type: "expense", amount_paise: 50000, category: "shopping" });
    expect((g!.records[0]!["items"] as unknown[]).length).toBe(2);
  });
});
