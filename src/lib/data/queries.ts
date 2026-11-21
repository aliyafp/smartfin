/** Data-access layer: all Lovable Cloud reads/writes for financial records live here. */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Transaction = Tables<"transactions">;
export type Source = Tables<"financial_sources">;
export type Profile = Tables<"profiles">;

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You're signed out. Please sign in again.");
  return data.user.id;
}

export const qk = {
  txns: ["transactions"] as const,
  sources: ["sources"] as const,
  profile: ["profile"] as const,
};

export const transactionsQuery = queryOptions({
  queryKey: qk.txns,
  queryFn: async (): Promise<Transaction[]> => {
    const all: Transaction[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await supabase.from("transactions").select("*").order("occurred_at", { ascending: false }).range(from, from + page - 1);
      if (error) throw error;
      all.push(...data);
      if (data.length < page) break;
    }
    return all;
  },
});

export const sourcesQuery = queryOptions({
  queryKey: qk.sources,
  queryFn: async (): Promise<Source[]> => {
    const { data, error } = await supabase.from("financial_sources").select("*").order("created_at");
    if (error) throw error;
    return data;
  },
});

export const profileQuery = queryOptions({
  queryKey: qk.profile,
  queryFn: async (): Promise<Profile | null> => {
    const uid = await requireUserId();
    const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (error) throw error;
    return data;
  },
});

export type TxnInput = Omit<TablesInsert<"transactions">, "user_id" | "id" | "created_at" | "updated_at">;

export async function createTransaction(input: TxnInput) {
  const user_id = await requireUserId();
  const { data, error } = await supabase.from("transactions").insert({ ...input, user_id }).select().single();
  if (error) throw error;
  return data;
}
export async function updateTransaction(id: string, patch: TablesUpdate<"transactions">) {
  const { error } = await supabase.from("transactions").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteTransaction(id: string) {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
}

export type SourceInput = Omit<TablesInsert<"financial_sources">, "user_id" | "id" | "created_at">;
export async function createSource(input: SourceInput) {
  const user_id = await requireUserId();
  const { data, error } = await supabase.from("financial_sources").insert({ ...input, user_id }).select().single();
  if (error) throw error;
  return data;
}
export async function updateSource(id: string, patch: TablesUpdate<"financial_sources">) {
  const { error } = await supabase.from("financial_sources").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteSource(id: string) {
  const { error } = await supabase.from("financial_sources").delete().eq("id", id);
  if (error) throw error;
}

export async function updateProfile(patch: TablesUpdate<"profiles">) {
  const uid = await requireUserId();
  const { error } = await supabase.from("profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", uid);
  if (error) throw error;
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string") return e.message;
  return "Something went wrong. Please try again.";
}
