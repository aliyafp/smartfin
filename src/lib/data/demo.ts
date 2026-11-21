/**
 * Demonstration mode. Inserts clearly-labelled sample records (is_demo = true,
 * entry_method = 'demo') for the signed-in user, and removes them on request.
 * Demo data is only ever created by an explicit user action.
 */
import { supabase } from "@/integrations/supabase/client";

export async function loadDemoData() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Please sign in first.");
  const user_id = u.user.id;

  const { data: sources, error: sErr } = await supabase
    .from("financial_sources")
    .insert([
      { user_id, name: "Demo Savings Account", source_type: "bank", masked_label: "••4821", acquisition_method: "demo", opening_balance_paise: 4500000, is_demo: true },
      { user_id, name: "Demo UPI (Google Pay)", source_type: "gpay", acquisition_method: "demo", opening_balance_paise: 0, is_demo: true },
      { user_id, name: "Demo Cash Wallet", source_type: "cash", acquisition_method: "demo", opening_balance_paise: 300000, is_demo: true },
    ])
    .select();
  if (sErr) throw sErr;
  const [bank, upi, cash] = sources;
  if (!bank || !upi || !cash) throw new Error("Could not create demo sources.");

  const now = new Date();
  const at = (monthsAgo: number, day: number, hour = 12) => {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, Math.min(day, 28), hour, 15);
    return (d > now ? new Date(now.getTime() - 3600000) : d).toISOString();
  };
  type Row = { t: "income" | "expense" | "refund" | "transfer"; a: number; d: string; c: string | null; s: string; to?: string; pm: string; at: string };
  const rows: Row[] = [];
  for (const m of [2, 1, 0]) {
    rows.push(
      { t: "income", a: 6500000, d: "Salary — Acme Technologies", c: "salary", s: bank.id, pm: "NEFT", at: at(m, 1, 10) },
      { t: "expense", a: 1800000, d: "Monthly rent", c: "housing", s: bank.id, pm: "IMPS", at: at(m, 3, 9) },
      { t: "expense", a: 245050 + m * 11000, d: "BigBasket order", c: "groceries", s: upi.id, pm: "UPI", at: at(m, 6, 19) },
      { t: "expense", a: 64900, d: "Swiggy — dinner", c: "food", s: upi.id, pm: "UPI", at: at(m, 8, 21) },
      { t: "expense", a: 149900, d: "Electricity bill — BESCOM", c: "utilities", s: bank.id, pm: "UPI", at: at(m, 10, 11) },
      { t: "expense", a: 64900, d: "Netflix subscription", c: "subscriptions", s: bank.id, pm: "Credit card", at: at(m, 12, 8) },
      { t: "expense", a: 32000 + m * 5000, d: "Ola ride", c: "transport", s: upi.id, pm: "UPI", at: at(m, 14, 18) },
      { t: "expense", a: 18000, d: "Chai & snacks", c: "food", s: cash.id, pm: "Cash", at: at(m, 15, 17) },
      { t: "transfer", a: 500000, d: "Top-up UPI wallet", c: null, s: bank.id, to: upi.id, pm: "Bank transfer", at: at(m, 5, 9) },
    );
  }
  rows.push(
    { t: "expense", a: 349900, d: "Myntra — shoes", c: "shopping", s: upi.id, pm: "UPI", at: at(0, 9, 20) },
    { t: "refund", a: 349900, d: "Myntra refund — shoes returned", c: "shopping", s: upi.id, pm: "UPI", at: at(0, 13, 12) },
    { t: "income", a: 1200000, d: "Freelance design project", c: "freelance", s: bank.id, pm: "UPI", at: at(1, 20, 15) },
  );

  const { error } = await supabase.from("transactions").insert(
    rows.map((r) => ({
      user_id, txn_type: r.t, amount_paise: r.a, description: r.d, category: r.c, source_id: r.s, to_source_id: r.to ?? null,
      payment_method: r.pm, occurred_at: r.at, entry_method: "demo", is_demo: true,
    })),
  );
  if (error) throw error;
}

export async function clearDemoData() {
  const { error: tErr } = await supabase.from("transactions").delete().eq("is_demo", true);
  if (tErr) throw tErr;
  const { error: sErr } = await supabase.from("financial_sources").delete().eq("is_demo", true);
  if (sErr) throw sErr;
}
