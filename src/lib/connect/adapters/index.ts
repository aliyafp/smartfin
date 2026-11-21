/**
 * Provider adapters. Every provider exposes the same interface; operations a
 * provider doesn't support return an explicit `unsupported` result instead of
 * pretending to work. File-based adapters parse exports the user downloaded.
 */
import { getProvider, UNAVAILABLE_MESSAGE, type MethodSpec } from "../providers";
import type { ParseResult } from "../types";
import { parseAmazonOrders } from "./amazon";
import { parseGooglePayExport } from "./google-pay";
import { parsePaytmStatement } from "./paytm";

export type Unsupported = { ok: false; unsupported: true; reason: string };
export type ExportInput = { fileName: string; text?: string; rows?: string[][] };

export interface ProviderAdapter {
  providerId: string;
  getAvailableCapabilities(): MethodSpec[];
  /** Parses a user-downloaded export file. Throws ExportFileError with a friendly message. */
  parseExport(input: ExportInput): ParseResult | Unsupported;
  initiateConnection(): Unsupported;
  fetchHistoricalRecords(): Unsupported;
  fetchIncrementalRecords(): Unsupported;
  refreshAuthorisation(): Unsupported;
  revokeConnection(): Unsupported;
}

const unsupported = (reason: string): Unsupported => ({ ok: false, unsupported: true, reason });
const NO_API = "This provider has no approved direct connection. Upload an export file instead.";

function make(providerId: string, parse?: (input: ExportInput) => ParseResult): ProviderAdapter {
  const p = getProvider(providerId);
  const reason = p?.status === "available" ? NO_API : p?.statusNote ?? UNAVAILABLE_MESSAGE;
  return {
    providerId,
    getAvailableCapabilities: () => (p?.status === "available" ? p.methods : []),
    parseExport: (input) => (parse && p?.status === "available" ? parse(input) : unsupported(p?.statusNote ?? UNAVAILABLE_MESSAGE)),
    initiateConnection: () => unsupported(reason),
    fetchHistoricalRecords: () => unsupported(reason),
    fetchIncrementalRecords: () => unsupported(reason),
    refreshAuthorisation: () => unsupported(reason),
    revokeConnection: () => unsupported("Nothing to revoke at the provider: SMARTFIN never received a login or token. Disconnecting stops further imports."),
  };
}

const ADAPTERS: Record<string, ProviderAdapter> = {
  google_pay: make("google_pay", ({ fileName, text }) => parseGooglePayExport(fileName, text ?? "")),
  paytm: make("paytm", ({ rows }) => parsePaytmStatement(rows ?? [])),
  amazon: make("amazon", ({ text }) => parseAmazonOrders(text ?? "")),
};

export function getAdapter(providerId: string): ProviderAdapter {
  return ADAPTERS[providerId] ?? make(providerId);
}

export const isUnsupported = (r: ParseResult | Unsupported): r is Unsupported => "unsupported" in r;
