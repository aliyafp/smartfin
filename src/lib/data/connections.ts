/** Connect Your Apps data access: connections, consent, sync history, atomic sync save and removal. */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { CONSENT_VERSION, type MethodSpec, type Provider } from "@/lib/connect/providers";
import type { ExistingForMatch } from "@/lib/connect/engine/match";
import type { IngestGroup, ReviewCounts } from "@/lib/connect/engine/review";

export type AppConnection = Tables<"app_connections">;
export type SyncBatch = Tables<"sync_batches">;
export type ConnectionConsent = Tables<"connection_consents">;

export const connectKeys = {
  all: ["connect"] as const,
  connections: ["connect", "connections"] as const,
  batches: (connectionId: string) => ["connect", "batches", connectionId] as const,
  consents: (connectionId: string) => ["connect", "consents", connectionId] as const,
};

export const connectionsQuery = queryOptions({
  queryKey: connectKeys.connections,
  queryFn: async (): Promise<AppConnection[]> => {
    const { data, error } = await supabase.from("app_connections").select("*").order("connected_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const batchesQuery = (connectionId: string) => queryOptions({
  queryKey: connectKeys.batches(connectionId),
  queryFn: async (): Promise<SyncBatch[]> => {
    const { data, error } = await supabase.from("sync_batches").select("*").eq("connection_id", connectionId).order("started_at", { ascending: false }).limit(50);
    if (error) throw error;
    return data;
  },
});

export const consentQuery = (connectionId: string) => queryOptions({
  queryKey: connectKeys.consents(connectionId),
  queryFn: async (): Promise<ConnectionConsent | null> => {
    const { data, error } = await supabase.from("connection_consents").select("*").eq("connection_id", connectionId).is("revoked_at", null).order("granted_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },
});

/** The sentence the user agrees to; stored with the consent record. */
export function consentPurpose(p: Provider, m: MethodSpec): string {
  return `Allow SMARTFIN to read the ${p.name} ${m.label} I upload, to show my spending, income and refunds from ${p.name}. Nothing is saved until I review it.`.slice(0, 400);
}

/** Records consent and creates (or re-activates) the connection. Atomic in the database. */
export async function connectApp(p: Provider, m: MethodSpec): Promise<string> {
  const { data, error } = await supabase.rpc("connect_app", {
    p_provider_id: p.id, p_method: m.method, p_data_types: m.dataTypes, p_purpose: consentPurpose(p, m), p_consent_version: CONSENT_VERSION,
  });
  if (error) throw error;
  return data;
}

export async function setConnectionStatus(connectionId: string, action: "pause" | "resume" | "revoke"): Promise<string> {
  const { data, error } = await supabase.rpc("set_connection_status", { p_connection_id: connectionId, p_action: action });
  if (error) throw error;
  return data;
}

export async function deleteConnectionData(connectionId: string): Promise<{ transactions: number; records: number }> {
  const { data, error } = await supabase.rpc("delete_connection_data", { p_connection_id: connectionId });
  if (error) throw error;
  return data as unknown as { transactions: number; records: number };
}

/** Everything the review needs to spot already-imported rows and the same payment seen elsewhere. */
export async function loadMatchContext(providerId: string): Promise<{ existingTxns: ExistingForMatch[]; existingRecordIds: Set<string>; linkedProviders: Map<string, Set<string>> }> {
  const existingTxns: ExistingForMatch[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("transactions")
      .select("id, txn_type, amount_paise, occurred_at, merchant, description, reference, provider_id, confirmation_status")
      .order("occurred_at", { ascending: false }).range(from, from + 999);
    if (error) throw error;
    existingTxns.push(...data);
    if (data.length < 1000) break;
  }
  const existingRecordIds = new Set<string>();
  const linkedProviders = new Map<string, Set<string>>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("source_records").select("provider_id, provider_record_id, transaction_id").range(from, from + 999);
    if (error) throw error;
    for (const r of data) {
      if (r.provider_id === providerId) existingRecordIds.add(r.provider_record_id);
      if (r.transaction_id) {
        const s = linkedProviders.get(r.transaction_id) ?? new Set<string>();
        s.add(r.provider_id);
        linkedProviders.set(r.transaction_id, s);
      }
    }
    if (data.length < 1000) break;
  }
  return { existingTxns, existingRecordIds, linkedProviders };
}

export interface IngestResult { batch_id: string; created: number; linked: number; recorded?: number; skipped: number; repeat: boolean }

/** Saves one reviewed upload in a single database transaction. Re-sending the same batch id is a no-op. */
export async function ingestSync(args: { batchId: string; connectionId: string; fileName: string; fileHash: string; groups: IngestGroup[]; counts: ReviewCounts }): Promise<IngestResult> {
  const { data, error } = await supabase.rpc("ingest_source_records", {
    p_batch_id: args.batchId, p_connection_id: args.connectionId, p_file_name: args.fileName, p_file_hash: args.fileHash,
    p_groups: args.groups as unknown as Json,
    p_counts: { received: args.counts.received, review: args.counts.review, duplicates: args.counts.duplicates, rejected: args.counts.rejected, errors: 0 } as Json,
  });
  if (error) {
    if (/CONNECTION_NOT_ACTIVE/.test(error.message)) throw new Error("This connection is paused or disconnected. Resume it to import.");
    throw error;
  }
  return data as unknown as IngestResult;
}
