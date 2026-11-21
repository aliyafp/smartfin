/** Fictional, anonymised extraction fixtures (shape the reading model returns). */
import type { RawExtraction, RawField } from "../types";

export const f = (value: string | null, confidence: RawField["confidence"] = "high"): RawField => ({ value, confidence });
const empty = (): RawField => f(null);

export function raw(over: Partial<Omit<RawExtraction, "fields" | "amounts">> & { fields?: Partial<RawExtraction["fields"]>; amounts?: Partial<RawExtraction["amounts"]> } = {}): RawExtraction {
  const { fields = {}, amounts = {}, ...rest } = over;
  return {
    document_type: "upi_payment",
    classification_confidence: "high",
    language: "en",
    image_quality: "good",
    readable_text_found: true,
    status_text: null,
    status: "unknown",
    direction: "unknown",
    counterparty_is_own_account: null,
    payment_state_on_document: "not_stated",
    items: [],
    notes_for_review: null,
    ...rest,
    fields: {
      merchant_name: empty(), counterparty_name: empty(), payer_name: empty(), amount: empty(), currency: empty(), date: empty(), time: empty(),
      reference_number: empty(), receipt_number: empty(), payment_method: empty(), payment_app: empty(), bank_name: empty(), upi_id: empty(),
      description: empty(), merchant_address: empty(), ...fields,
    },
    amounts: {
      subtotal: empty(), discount: empty(), gst_rate: empty(), gst_amount: empty(), cgst: empty(), sgst: empty(), igst: empty(), other_taxes: empty(), other_charges: empty(), delivery_fee: empty(),
      packaging_fee: empty(), round_off: empty(), total: empty(), amount_paid: empty(), ...amounts,
    },
  };
}

export const upiSuccess = raw({
  document_type: "upi_payment", status_text: "Payment Successful", status: "success", direction: "paid_out",
  fields: { merchant_name: f("Sharma General Store"), amount: f("₹450"), date: f("18 Nov 2026"), time: f("7:42 PM"), reference_number: f("UPI Ref No: 432109876543"), payment_app: f("Google Pay") },
});

export const groceryReceipt = raw({
  document_type: "grocery_receipt", payment_state_on_document: "paid",
  fields: { merchant_name: f("FRESHMART SUPERMARKET PVT LTD"), date: f("12/11/2026"), receipt_number: f("INV-20931"), payment_method: f("Paid by UPI") },
  amounts: { subtotal: f("265.00"), total: f("₹265.00") },
  items: [
    { name: "Rice 1kg", quantity: "1", unit_price: "120.00", line_total: "120.00", confidence: "high" },
    { name: "Milk 1L", quantity: "2", unit_price: "30.00", line_total: "60.00", confidence: "high" },
    { name: "Soap", quantity: "1", unit_price: "45.00", line_total: "45.00", confidence: "medium" },
    { name: "Bread", quantity: "1", unit_price: "40.00", line_total: "40.00", confidence: "high" },
  ],
});
