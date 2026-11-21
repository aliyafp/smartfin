/**
 * Provider capability registry. The single source of truth for what SMARTFIN
 * can honestly do with each app. Only `available` providers get a working
 * Connect button; every other status explains why and offers alternatives.
 * Verified 2026-11 — see the Connect Your Apps feasibility report.
 */
import type { CapabilityStatus, ConnectionMethod, DataType, ProviderCategory } from "./types";

export const REGISTRY_VERSION = "2026-11-20";
export const CONSENT_VERSION = "connect-v1";

export type Tone = "coral" | "saffron" | "turquoise" | "violet" | "pink" | "plum";

export interface MethodSpec {
  method: Extract<ConnectionMethod, "file_export" | "statement_pdf">;
  label: string;
  /** Accept attribute for the file input. */
  accept: string;
  fileLabel: string;
  steps: string[];
  dataTypes: DataType[];
  /** What the file really contains, shown before consent. */
  shares: string[];
  /** Extra privacy line, e.g. AI reading for PDFs. */
  processingNote?: string;
}

export interface Provider {
  id: string;
  name: string;
  category: ProviderCategory;
  tone: Tone;
  aliases: string[];
  status: CapabilityStatus;
  /** One-line reason shown on cards that are not available. */
  statusNote?: string;
  methods: MethodSpec[];
  /** Category used when nothing more specific is known. */
  defaultCategory: string | null;
  /** Where to go instead when there's no direct route. */
  alternatives: ("scan" | "csv" | "statement")[];
  /** Built-in SMARTFIN screen that already covers this source. */
  internalRoute?: "/import";
  docs: { label: string; url: string }[];
}

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  payments: "Payments",
  shopping: "Shopping",
  food: "Food & Grocery",
  transport: "Transport",
  subscriptions: "Subscriptions",
  banks: "Banks",
  email: "Email receipts",
};

export const FILTERS: { key: "all" | ProviderCategory; label: string }[] = [
  { key: "all", label: "All Apps" },
  { key: "payments", label: "Payments" },
  { key: "shopping", label: "Shopping" },
  { key: "food", label: "Food & Grocery" },
  { key: "transport", label: "Transport" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "banks", label: "Banks" },
];

export const STATUS_LABELS: Record<CapabilityStatus, string> = {
  available: "Available",
  awaiting_setup: "Awaiting setup",
  needs_approval: "Needs approval",
  partner_required: "Partner required",
  unsupported: "Unsupported",
};

export const UNAVAILABLE_MESSAGE = "This provider does not currently have a verified direct connection available.";

const PAYMENT_SHARES = ["Payment date and time", "Amount", "Who you paid or received from", "Status (completed, failed, pending)", "UPI or transaction reference, when the file has one"];

export const PROVIDERS: Provider[] = [
  {
    id: "google_pay", name: "Google Pay", category: "payments", tone: "turquoise", aliases: ["gpay", "g pay", "tez"],
    status: "available", defaultCategory: null, alternatives: ["statement"],
    methods: [
      {
        method: "file_export", label: "Google Takeout activity file", accept: ".html,.htm,.json,.csv,text/html,application/json,text/csv",
        fileLabel: "My Activity.html, My Activity.json or a Google transactions CSV",
        steps: [
          "Open takeout.google.com while signed in to the Google account you use for Google Pay.",
          "Click “Deselect all”, then tick “Google Pay” (and optionally “My Activity” → Google Pay).",
          "Create the export and download the .zip when Google emails you.",
          "Unzip it and choose “Google Pay/My Activity/My Activity.html” (or the .json / transactions .csv) here.",
        ],
        dataTypes: ["payments", "refunds", "merchant", "status", "reference"], shares: PAYMENT_SHARES,
      },
      {
        method: "statement_pdf", label: "Google Pay statement PDF", accept: ".pdf,application/pdf", fileLabel: "Statement PDF downloaded from the Google Pay app",
        steps: ["In Google Pay, open your profile → “Transaction history” or “Statements”.", "Choose a date range and download the statement PDF.", "If the PDF is password-protected, open it and save a copy without a password first."],
        dataTypes: ["payments", "refunds", "merchant", "reference"], shares: PAYMENT_SHARES,
        processingNote: "Your PDF is read once by Lovable AI to pull out the transactions. It is not stored by SMARTFIN or kept by the AI service.",
      },
    ],
    docs: [{ label: "Google Pay help: transaction history", url: "https://support.google.com/googlepay/answer/9015738?hl=en" }, { label: "Google Takeout", url: "https://takeout.google.com" }],
  },
  {
    id: "phonepe", name: "PhonePe", category: "payments", tone: "violet", aliases: ["phone pe"],
    status: "available", defaultCategory: null, alternatives: ["statement"],
    methods: [{
      method: "statement_pdf", label: "PhonePe statement PDF", accept: ".pdf,application/pdf", fileLabel: "Statement PDF from the PhonePe app",
      steps: ["In PhonePe, open History → “Download statement”.", "Pick a date range; PhonePe sends a PDF (usually protected with your phone number as the password).", "Open the PDF and save or print a copy without the password, then choose that copy here."],
      dataTypes: ["payments", "refunds", "merchant", "reference"], shares: PAYMENT_SHARES,
      processingNote: "Your PDF is read once by Lovable AI to pull out the transactions. It is not stored by SMARTFIN or kept by the AI service.",
    }],
    docs: [],
  },
  {
    id: "paytm", name: "Paytm", category: "payments", tone: "turquoise", aliases: ["pay tm"],
    status: "available", defaultCategory: null, alternatives: ["statement"],
    methods: [{
      method: "file_export", label: "Paytm UPI statement (Excel)", accept: ".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv", fileLabel: "Paytm UPI statement .xlsx (or saved as .csv)",
      steps: ["In Paytm, open “Balance & History” → “Download UPI statement”.", "Choose a date range and download the Excel (.xlsx) file.", "Choose that file here — no need to convert it."],
      dataTypes: ["payments", "refunds", "merchant", "reference"], shares: PAYMENT_SHARES,
    }],
    docs: [],
  },
  {
    id: "amazon", name: "Amazon", category: "shopping", tone: "saffron", aliases: ["amazon.in", "amzn", "amazon pay"],
    status: "available", defaultCategory: "shopping", alternatives: ["scan"],
    methods: [{
      method: "file_export", label: "Amazon “Request My Data” order history", accept: ".csv,text/csv", fileLabel: "Retail.OrderHistory.1.csv (or similar) from your Amazon data download",
      steps: ["On Amazon, go to Account → “Request your data” (Privacy notice → Request my data).", "Choose “Your Orders” and submit the request; Amazon emails a download link, often within a few days.", "Unzip the download and choose the Retail.OrderHistory CSV file here."],
      dataTypes: ["orders", "order_items", "cancellations", "payment_method"],
      shares: ["Order id and date", "Order total you owed", "Product names and quantities", "Order status (including cancellations)", "Payment type (e.g. UPI, card)"],
    }],
    docs: [],
  },
  { id: "flipkart", name: "Flipkart", category: "shopping", tone: "saffron", aliases: [], status: "unsupported", statusNote: "Flipkart's APIs are for sellers; no customer order export was found.", methods: [], defaultCategory: "shopping", alternatives: ["scan", "statement"], docs: [] },
  { id: "swiggy", name: "Swiggy", category: "food", tone: "coral", aliases: ["instamart"], status: "needs_approval", statusNote: "Swiggy's official programme is invite-only and reviewed. SMARTFIN hasn't been approved yet.", methods: [], defaultCategory: "food", alternatives: ["scan", "statement"], docs: [{ label: "Swiggy builders: production access", url: "https://mcp.swiggy.com/builders/docs/operate/access/" }] },
  { id: "zomato", name: "Zomato", category: "food", tone: "coral", aliases: [], status: "needs_approval", statusNote: "Zomato's order-history access is allow-listed for testing. A production agreement is needed.", methods: [], defaultCategory: "food", alternatives: ["scan", "statement"], docs: [{ label: "Zomato MCP manifest", url: "https://github.com/Zomato/mcp-server-manifest" }] },
  { id: "blinkit", name: "Blinkit", category: "food", tone: "saffron", aliases: [], status: "unsupported", statusNote: "No official customer data access exists. SMARTFIN does not use scraping.", methods: [], defaultCategory: "groceries", alternatives: ["scan", "statement"], docs: [] },
  { id: "uber", name: "Uber", category: "transport", tone: "plum", aliases: [], status: "needs_approval", statusNote: "Uber's ride-history permission needs Full Access approval from Uber.", methods: [], defaultCategory: "transport", alternatives: ["scan", "statement"], docs: [{ label: "Uber rider scopes", url: "https://developer.uber.com/docs/riders/guides/scopes" }] },
  { id: "ola", name: "Ola", category: "transport", tone: "turquoise", aliases: ["olacabs"], status: "partner_required", statusNote: "Ola's ride-history access is invite-only for partners.", methods: [], defaultCategory: "transport", alternatives: ["scan", "statement"], docs: [{ label: "Ola developer overview", url: "https://developers.olacabs.com/docs/overview" }] },
  { id: "netflix", name: "Netflix", category: "subscriptions", tone: "coral", aliases: [], status: "unsupported", statusNote: "No customer billing API. Your Netflix charges appear on bank, card or UPI statements.", methods: [], defaultCategory: "subscriptions", alternatives: ["statement", "scan"], docs: [] },
  { id: "spotify", name: "Spotify", category: "subscriptions", tone: "turquoise", aliases: [], status: "unsupported", statusNote: "Spotify's API doesn't share billing. Charges appear on your bank, card or UPI statements.", methods: [], defaultCategory: "subscriptions", alternatives: ["statement", "scan"], docs: [] },
  { id: "bank_statement", name: "Bank statement (CSV)", category: "banks", tone: "violet", aliases: ["bank", "statement", "net banking"], status: "available", methods: [], defaultCategory: null, alternatives: [], internalRoute: "/import", docs: [] },
  { id: "account_aggregator", name: "Banks via Account Aggregator", category: "banks", tone: "plum", aliases: ["aa", "sahamati", "bank account"], status: "partner_required", statusNote: "Needs a regulated Account Aggregator partner (FIU registration and certification).", methods: [], defaultCategory: null, alternatives: ["csv"], docs: [{ label: "Sahamati: becoming an FIU", url: "https://sahamati.org.in/fiu/" }] },
  { id: "gmail", name: "Gmail receipts", category: "email", tone: "coral", aliases: ["google mail", "email"], status: "awaiting_setup", statusNote: "Possible once a workspace admin adds a Gmail sign-in client. Google also reviews read access to email.", methods: [], defaultCategory: null, alternatives: ["scan"], docs: [{ label: "Gmail restricted-scope verification", url: "https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification" }] },
];

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));
export const getProvider = (id: string | null | undefined): Provider | undefined => (id ? BY_ID.get(id) : undefined);

/** True only when SMARTFIN itself can run this method end to end. */
export function canConnect(p: Provider, method?: string): boolean {
  if (p.status !== "available") return false;
  return method ? p.methods.some((m) => m.method === method) : p.methods.length > 0;
}

export function searchProviders(list: Provider[], query: string, filter: "all" | ProviderCategory): Provider[] {
  const q = query.trim().toLowerCase();
  return list.filter((p) => {
    if (filter !== "all" && p.category !== filter) return false;
    if (!q) return true;
    return [p.name, CATEGORY_LABELS[p.category], ...p.aliases].some((s) => s.toLowerCase().includes(q));
  });
}

export type ProviderSection = "available" | "approval" | "unavailable";
export function sectionOf(p: Provider): ProviderSection {
  if (p.status === "available") return "available";
  if (p.status === "unsupported") return "unavailable";
  return "approval";
}

/** Group used by the Transactions source filter. */
export type SourceGroup = "payments" | "shopping" | "food" | "transport" | "banks" | "manual" | "other";
export const SOURCE_GROUP_LABELS: Record<SourceGroup | "all", string> = {
  all: "All sources", payments: "Payment apps", shopping: "Shopping", food: "Food", transport: "Transport", banks: "Banks", manual: "Manually added", other: "Other",
};

export function sourceGroupOf(t: { provider_id?: string | null; entry_method: string }): SourceGroup {
  const p = getProvider(t.provider_id);
  if (p) return p.category === "payments" || p.category === "shopping" || p.category === "food" || p.category === "transport" || p.category === "banks" ? p.category : "other";
  if (t.entry_method === "csv") return "banks";
  if (t.entry_method === "manual") return "manual";
  return "other";
}

/** Display label for "spending by app": the provider name, or how the record was entered. */
export function sourceLabelOf(t: { provider_id?: string | null; entry_method: string }): string {
  const p = getProvider(t.provider_id);
  if (p) return p.name;
  return ({ manual: "Manually added", csv: "Statement import", receipt: "Scanned receipts", demo: "Demo records" } as Record<string, string>)[t.entry_method] ?? "Other";
}
