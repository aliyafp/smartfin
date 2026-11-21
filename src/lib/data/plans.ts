/** Data access for budgets, savings goals and savings contributions (owner-scoped by RLS). */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

export type Budget = Tables<"budgets">;
export type Goal = Tables<"savings_goals">;
export type Contribution = Tables<"savings_contributions">;

export const planKeys = {
  budgets: ["budgets"] as const,
  goals: ["savings_goals"] as const,
  contributions: ["savings_contributions"] as const,
};

async function uid(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You're signed out. Please sign in again.");
  return data.user.id;
}

export const budgetsQuery = queryOptions({
  queryKey: planKeys.budgets,
  queryFn: async (): Promise<Budget[]> => {
    const { data, error } = await supabase.from("budgets").select("*").order("created_at");
    if (error) throw error;
    return data;
  },
});

export const goalsQuery = queryOptions({
  queryKey: planKeys.goals,
  queryFn: async (): Promise<Goal[]> => {
    const { data, error } = await supabase.from("savings_goals").select("*").order("created_at");
    if (error) throw error;
    return data;
  },
});

export const contributionsQuery = queryOptions({
  queryKey: planKeys.contributions,
  queryFn: async (): Promise<Contribution[]> => {
    const { data, error } = await supabase
      .from("savings_contributions")
      .select("*")
      .order("contributed_on", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

/** One budget per category: saving an existing category replaces its limit. */
export async function saveBudget(category: string, limitPaise: number) {
  const user_id = await uid();
  const { error } = await supabase
    .from("budgets")
    .upsert(
      { user_id, category, limit_paise: limitPaise, updated_at: new Date().toISOString() },
      { onConflict: "user_id,category" },
    );
  if (error) throw error;
}
export async function deleteBudget(id: string) {
  const { error } = await supabase.from("budgets").delete().eq("id", id);
  if (error) throw error;
}

export interface GoalFields {
  name: string;
  target_paise: number;
  target_date: string | null;
  notes: string | null;
}
export async function createGoal(v: GoalFields) {
  const user_id = await uid();
  const { data, error } = await supabase
    .from("savings_goals")
    .insert({ ...v, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}
export async function updateGoal(id: string, patch: TablesUpdate<"savings_goals">) {
  const { error } = await supabase
    .from("savings_goals")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
export async function deleteGoal(id: string) {
  const { error } = await supabase.from("savings_goals").delete().eq("id", id);
  if (error) throw error;
}

export interface ContributionFields {
  goal_id: string;
  kind: "deposit" | "withdrawal";
  amount_paise: number;
  contributed_on: string;
  note: string | null;
}
export async function createContribution(v: ContributionFields) {
  const user_id = await uid();
  const { error } = await supabase.from("savings_contributions").insert({ ...v, user_id });
  if (error) throw error;
}
export async function updateContribution(id: string, v: ContributionFields) {
  const { error } = await supabase.from("savings_contributions").update(v).eq("id", id);
  if (error) throw error;
}
export async function deleteContribution(id: string) {
  const { error } = await supabase.from("savings_contributions").delete().eq("id", id);
  if (error) throw error;
}
