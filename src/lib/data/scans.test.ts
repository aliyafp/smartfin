import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { DuplicateReferenceError, saveExtraction, type SaveExtractionArgs } from "./scans";

const args: SaveExtractionArgs = {
  extractionId: "00000000-0000-0000-0000-000000000001",
  txn: { txn_type: "expense", amount_paise: 45000, description: "Shop", merchant: "Shop", category: "groceries", occurred_at: "2026-11-18T12:00:00.000Z", source_id: null, to_source_id: null, payment_method: "UPI", reference: "432109876543", notes: null },
  items: [], allowDuplicate: false, keepImage: false, reviewed: {}, validation: [],
};

describe("saving a reviewed scan", () => {
  it("reports a database failure instead of pretending it saved", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "connection lost" } });
    await expect(saveExtraction(args)).rejects.toThrow("Couldn't save: connection lost");
  });
  it("turns a duplicate reference refusal into a duplicate warning", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "DUPLICATE_REFERENCE" } });
    await expect(saveExtraction(args)).rejects.toBeInstanceOf(DuplicateReferenceError);
  });
  it("returns the new transaction id on success", async () => {
    rpc.mockResolvedValueOnce({ data: "txn-1", error: null });
    await expect(saveExtraction(args)).resolves.toBe("txn-1");
  });
});
