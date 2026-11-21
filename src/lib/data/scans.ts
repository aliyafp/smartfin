/** Scan & Extract data access: consent, private image storage, extraction records, rules and saving. */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";

export type Extraction = Tables<"document_extractions">;
export type ReceiptItem = Tables<"receipt_items">;
export type CategoryRuleRow = Tables<"category_rules">;

const BUCKET = "documents";
export const CONSENT_PROVIDER = "Lovable AI";

export const scanKeys = {
  all: ["scans"] as const,
  list: ["scans", "list"] as const,
  one: (id: string) => ["scans", "one", id] as const,
  consent: ["scans", "consent"] as const,
  rules: ["scans", "rules"] as const,
  items: (txnId: string) => ["scans", "items", txnId] as const,
  image: (path: string) => ["scans", "image", path] as const,
};

/** Refreshes scan records without re-requesting image links for files that may just have been deleted. */
export function invalidateScans(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "scans" && q.queryKey[1] !== "image" });
}

async function uid(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You're signed out. Please sign in again.");
  return data.user.id;
}

// ---------- Consent ----------
export const consentQuery = queryOptions({
  queryKey: scanKeys.consent,
  queryFn: async () => {
    const { data, error } = await supabase.from("data_consents").select("*").eq("purpose", "image_extraction").is("revoked_at", null).order("granted_at", { ascending: false }).limit(1);
    if (error) throw error;
    return data[0] ?? null;
  },
});
export async function grantConsent() {
  const user_id = await uid();
  const { error } = await supabase.from("data_consents").insert({ user_id, purpose: "image_extraction", provider: CONSENT_PROVIDER });
  if (error) throw error;
}
export async function revokeConsent() {
  const { error } = await supabase.from("data_consents").update({ revoked_at: new Date().toISOString() }).eq("purpose", "image_extraction").is("revoked_at", null);
  if (error) throw error;
}

// ---------- Extractions ----------
export const ACTIVE_STATUSES = ["uploaded", "processing", "extracted", "failed", "waiting"] as const;

export const extractionsQuery = queryOptions({
  queryKey: scanKeys.list,
  queryFn: async (): Promise<Extraction[]> => {
    const { data, error } = await supabase.from("document_extractions").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return data;
  },
});

export const extractionQuery = (id: string) => queryOptions({
  queryKey: scanKeys.one(id),
  queryFn: async (): Promise<Extraction | null> => {
    const { data, error } = await supabase.from("document_extractions").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const imageUrlQuery = (path: string | null) => queryOptions({
  queryKey: scanKeys.image(path ?? "none"),
  enabled: Boolean(path),
  staleTime: 8 * 60 * 1000,
  queryFn: async (): Promise<string | null> => {
    if (!path) return null;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
    if (error) throw error;
    return data.signedUrl;
  },
});

/** Uploads the (already shrunk) image to the user's private folder and creates the extraction record. */
export async function createExtraction(blob: Blob, fileName: string, batchId: string): Promise<string> {
  const user_id = await uid();
  const id = crypto.randomUUID();
  const path = `${user_id}/${id}.jpg`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (up.error) throw new Error("The image couldn't be uploaded. Check your connection and try again.");
  const { error } = await supabase.from("document_extractions").insert({
    id, user_id, batch_id: batchId, file_path: path, file_name: fileName.slice(0, 200), mime_type: "image/jpeg", processing_status: "uploaded",
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return id;
}

/** Replaces the stored image of an unfinished scan; the scan must then be read again. */
export async function replaceExtractionImage(ex: Extraction, blob: Blob) {
  const path = ex.file_path ?? `${ex.user_id}/${ex.id}.jpg`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error("The new image couldn't be uploaded. Try again.");
  const { error } = await supabase.from("document_extractions").update({
    file_path: path, mime_type: "image/jpeg", image_deleted_at: null, processing_status: "uploaded", error_code: null, reviewed_payload: null,
  }).eq("id", ex.id);
  if (error) throw error;
}

/** Deletes the stored image file only; extracted values stay for review. */
export async function deleteExtractionImage(ex: Pick<Extraction, "id" | "file_path">) {
  if (ex.file_path) {
    const { error } = await supabase.storage.from(BUCKET).remove([ex.file_path]);
    if (error) throw new Error("The image couldn't be deleted. Try again.");
  }
  const { error } = await supabase.from("document_extractions").update({ file_path: null, image_deleted_at: new Date().toISOString(), keep_image: false }).eq("id", ex.id);
  if (error) throw error;
}

export async function discardExtraction(ex: Extraction) {
  if (ex.file_path) await supabase.storage.from(BUCKET).remove([ex.file_path]);
  const { error } = await supabase.from("document_extractions").update({
    processing_status: "discarded", file_path: null, image_deleted_at: ex.file_path ? new Date().toISOString() : ex.image_deleted_at, extracted_payload: null, reviewed_payload: null,
  }).eq("id", ex.id);
  if (error) throw error;
}

export async function markWaiting(id: string, reviewed: Json) {
  const { error } = await supabase.from("document_extractions").update({ processing_status: "waiting", reviewed_payload: reviewed }).eq("id", id);
  if (error) throw error;
}

/** Deletes every stored scan image of the user (kept copies and unfinished scans). */
export async function deleteAllScanImages(list: Extraction[]) {
  for (const ex of list.filter((e) => e.file_path)) await deleteExtractionImage(ex);
}

export interface SaveExtractionArgs {
  extractionId: string;
  txn: {
    txn_type: string; amount_paise: number; description: string; merchant: string | null; category: string | null; occurred_at: string;
    source_id: string | null; to_source_id: string | null; payment_method: string | null; reference: string | null; notes: string | null;
  };
  items: { original_name: string; normalised_name: string | null; quantity: number | null; unit_price_paise: number | null; line_total_paise: number | null; category: string | null; confidence: string; review_status: string }[];
  allowDuplicate: boolean;
  keepImage: boolean;
  reviewed: Json;
  validation: Json;
}
export class DuplicateReferenceError extends Error { constructor() { super("A transaction with this reference number already exists."); } }

export async function saveExtraction(a: SaveExtractionArgs): Promise<string> {
  const { data, error } = await supabase.rpc("save_extraction", {
    p_extraction_id: a.extractionId, p_txn: a.txn as unknown as Json, p_items: a.items as unknown as Json,
    p_allow_duplicate: a.allowDuplicate, p_keep_image: a.keepImage, p_reviewed: a.reviewed, p_validation: a.validation,
  });
  if (error) {
    if (error.message.includes("DUPLICATE_REFERENCE")) throw new DuplicateReferenceError();
    throw new Error(`Couldn't save: ${error.message}`);
  }
  return data as string;
}

// ---------- Category rules ----------
export const categoryRulesQuery = queryOptions({
  queryKey: scanKeys.rules,
  queryFn: async (): Promise<CategoryRuleRow[]> => {
    const { data, error } = await supabase.from("category_rules").select("*").order("created_at");
    if (error) throw error;
    return data;
  },
});
export async function createCategoryRule(pattern: string, match_field: "merchant" | "item", category: string) {
  const user_id = await uid();
  const p = pattern.trim().toLowerCase().slice(0, 60);
  if (p.length < 2) return;
  const { error } = await supabase.from("category_rules").upsert({ user_id, pattern: p, match_field, category }, { onConflict: "user_id,match_field,pattern" });
  if (error) throw error;
}
export async function deleteCategoryRule(id: string) {
  const { error } = await supabase.from("category_rules").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Items on saved transactions ----------
export const receiptItemsQuery = (txnId: string) => queryOptions({
  queryKey: scanKeys.items(txnId),
  queryFn: async (): Promise<ReceiptItem[]> => {
    const { data, error } = await supabase.from("receipt_items").select("*").eq("transaction_id", txnId).order("position");
    if (error) throw error;
    return data;
  },
});
