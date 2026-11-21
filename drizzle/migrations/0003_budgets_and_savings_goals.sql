CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  category text NOT NULL CHECK (category IN ('food','groceries','shopping','transport','housing','utilities','entertainment','healthcare','education','subscriptions','personal_care','household','other','uncategorised')),
  limit_paise bigint NOT NULL CHECK (limit_paise > 0 AND limit_paise < 100000000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own budgets" ON public.budgets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  target_paise bigint NOT NULL CHECK (target_paise > 0 AND target_paise < 100000000000),
  target_date date,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_goals TO authenticated;
GRANT ALL ON public.savings_goals TO service_role;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goals" ON public.savings_goals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.savings_goals(user_id);

CREATE TABLE public.savings_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  goal_id uuid NOT NULL REFERENCES public.savings_goals(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'deposit' CHECK (kind IN ('deposit','withdrawal')),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0 AND amount_paise < 100000000000),
  contributed_on date NOT NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_contributions TO authenticated;
GRANT ALL ON public.savings_contributions TO service_role;
ALTER TABLE public.savings_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contributions" ON public.savings_contributions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.savings_goals g WHERE g.id = goal_id AND g.user_id = auth.uid()));
CREATE INDEX ON public.savings_contributions(user_id);
CREATE INDEX ON public.savings_contributions(goal_id);

-- A goal's saved amount (deposits − withdrawals) can never go below zero.
CREATE OR REPLACE FUNCTION public.check_goal_balance() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  g uuid;
  bal bigint;
BEGIN
  FOR g IN SELECT DISTINCT x FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.goal_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.goal_id END]) AS x WHERE x IS NOT NULL
  LOOP
    SELECT COALESCE(SUM(CASE WHEN kind = 'deposit' THEN amount_paise ELSE -amount_paise END), 0)
      INTO bal FROM public.savings_contributions WHERE goal_id = g;
    IF bal < 0 THEN
      RAISE EXCEPTION 'A withdrawal can''t be more than what is saved in this goal' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER savings_contributions_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.savings_contributions
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION public.check_goal_balance();