CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'INR',
  country text NOT NULL DEFAULT 'IN',
  locale text NOT NULL DEFAULT 'en-IN',
  time_format text NOT NULL DEFAULT '12h' CHECK (time_format IN ('12h','24h')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1), ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.financial_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  source_type text NOT NULL CHECK (source_type IN ('bank','gpay','phonepe','paytm','debit_card','credit_card','cash','other')),
  masked_label text CHECK (masked_label IS NULL OR char_length(masked_label) <= 12),
  currency text NOT NULL DEFAULT 'INR',
  acquisition_method text NOT NULL DEFAULT 'manual' CHECK (acquisition_method IN ('manual','csv','demo')),
  opening_balance_paise bigint NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_sources TO authenticated;
GRANT ALL ON public.financial_sources TO service_role;
ALTER TABLE public.financial_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sources" ON public.financial_sources FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.financial_sources(user_id);

CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_id uuid REFERENCES public.financial_sources(id) ON DELETE SET NULL,
  file_name text NOT NULL CHECK (char_length(file_name) <= 200),
  statement_kind text NOT NULL DEFAULT 'bank' CHECK (statement_kind IN ('bank','upi','gpay','phonepe','paytm','other')),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','completed_with_issues')),
  total_rows integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own imports" ON public.import_batches FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.import_batches(user_id, created_at DESC);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  txn_type text NOT NULL CHECK (txn_type IN ('income','expense','refund','transfer')),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0 AND amount_paise < 100000000000),
  currency text NOT NULL DEFAULT 'INR',
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 120),
  merchant text CHECK (merchant IS NULL OR char_length(merchant) <= 80),
  category text,
  occurred_at timestamptz NOT NULL,
  source_id uuid REFERENCES public.financial_sources(id) ON DELETE SET NULL,
  to_source_id uuid REFERENCES public.financial_sources(id) ON DELETE SET NULL,
  payment_method text,
  reference text CHECK (reference IS NULL OR char_length(reference) <= 64),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  entry_method text NOT NULL DEFAULT 'manual' CHECK (entry_method IN ('manual','csv','receipt','demo')),
  import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (txn_type <> 'transfer' OR (to_source_id IS NOT NULL AND source_id IS NOT NULL AND to_source_id <> source_id))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.transactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.transactions(user_id, occurred_at DESC);
CREATE INDEX ON public.transactions(import_batch_id);

CREATE OR REPLACE FUNCTION public.check_txn_sources() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM financial_sources WHERE id = NEW.source_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Invalid source';
  END IF;
  IF NEW.to_source_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM financial_sources WHERE id = NEW.to_source_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Invalid destination source';
  END IF;
  IF NEW.import_batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM import_batches WHERE id = NEW.import_batch_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Invalid import batch';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER txn_sources_check BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.check_txn_sources();

CREATE OR REPLACE FUNCTION public.import_statement(
  p_batch_id uuid, p_source_id uuid, p_file_name text, p_statement_kind text, p_rows jsonb,
  p_total_rows integer, p_invalid_count integer, p_duplicate_count integer
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); existing_owner uuid; n integer; skipped integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in before importing'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  SELECT user_id INTO existing_owner FROM public.import_batches WHERE id = p_batch_id;
  IF existing_owner = uid THEN RETURN p_batch_id; END IF;
  IF existing_owner IS NOT NULL THEN RAISE EXCEPTION 'Invalid import'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_sources WHERE id = p_source_id AND user_id = uid) THEN RAISE EXCEPTION 'Choose one of your own sources'; END IF;
  IF p_statement_kind NOT IN ('bank','upi','gpay','phonepe','paytm','other') THEN RAISE EXCEPTION 'Unknown statement type'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Invalid statement rows'; END IF;
  n := jsonb_array_length(p_rows);
  IF n < 1 OR n > 5000 THEN RAISE EXCEPTION 'An import must contain between 1 and 5000 transactions'; END IF;
  IF p_invalid_count < 0 OR p_duplicate_count < 0 OR p_total_rows < n + p_invalid_count THEN RAISE EXCEPTION 'Invalid import counts'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) r
    WHERE (r->>'txn_type') IS NULL OR (r->>'txn_type') NOT IN ('income','expense','refund')
      OR (r->>'amount_paise') IS NULL OR (r->>'amount_paise')::bigint <= 0 OR (r->>'amount_paise')::bigint >= 100000000000
      OR (r->>'description') IS NULL OR length(r->>'description') NOT BETWEEN 1 AND 120
      OR length(coalesce(r->>'merchant','')) > 80
      OR length(coalesce(r->>'reference','')) > 64
      OR (r->>'occurred_at') IS NULL
  ) THEN RAISE EXCEPTION 'Invalid transaction row'; END IF;
  skipped := p_total_rows - n - p_invalid_count;
  INSERT INTO public.import_batches(id,user_id,source_id,file_name,statement_kind,status,total_rows,imported_count,invalid_count,duplicate_count,skipped_count)
  VALUES (p_batch_id, uid, p_source_id, left(p_file_name, 200), p_statement_kind,
          CASE WHEN p_invalid_count > 0 OR skipped > 0 THEN 'completed_with_issues' ELSE 'completed' END,
          p_total_rows, n, p_invalid_count, p_duplicate_count, skipped);
  INSERT INTO public.transactions(user_id,source_id,import_batch_id,txn_type,amount_paise,description,merchant,occurred_at,reference,category,entry_method,currency)
  SELECT uid, p_source_id, p_batch_id, r->>'txn_type', (r->>'amount_paise')::bigint, r->>'description',
         nullif(r->>'merchant',''), (r->>'occurred_at')::timestamptz, nullif(r->>'reference',''), nullif(r->>'category',''), 'csv', 'INR'
  FROM jsonb_array_elements(p_rows) r;
  RETURN p_batch_id;
END; $$;
REVOKE ALL ON FUNCTION public.import_statement(uuid,uuid,text,text,jsonb,integer,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_statement(uuid,uuid,text,text,jsonb,integer,integer,integer) TO authenticated, service_role;