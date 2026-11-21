CREATE TABLE public.app_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider_id text NOT NULL CHECK (provider_id ~ '^[a-z0-9_]{2,40}$'),
  method text NOT NULL CHECK (method IN ('file_export','statement_pdf','oauth','partner')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked','error')),
  data_types text[] NOT NULL DEFAULT '{}',
  connected_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  revoked_at timestamptz,
  last_sync_at timestamptz,
  last_sync_status text,
  records_imported integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_id, method)
);
GRANT SELECT ON public.app_connections TO authenticated;
GRANT ALL ON public.app_connections TO service_role;
ALTER TABLE public.app_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own connections read" ON public.app_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.connection_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.app_connections(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  scope text[] NOT NULL DEFAULT '{}',
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 1 AND 400),
  consent_version text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
GRANT SELECT ON public.connection_consents TO authenticated;
GRANT ALL ON public.connection_consents TO service_role;
ALTER TABLE public.connection_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own consents read" ON public.connection_consents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.connection_consents(connection_id);

CREATE TABLE public.sync_batches (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.app_connections(id) ON DELETE CASCADE,
  file_name text CHECK (file_name IS NULL OR char_length(file_name) <= 200),
  file_hash text CHECK (file_hash IS NULL OR char_length(file_hash) <= 80),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','completed_with_issues','failed')),
  received_count integer NOT NULL DEFAULT 0,
  accepted_count integer NOT NULL DEFAULT 0,
  linked_count integer NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  not_counted_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT ON public.sync_batches TO authenticated;
GRANT ALL ON public.sync_batches TO service_role;
ALTER TABLE public.sync_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sync batches read" ON public.sync_batches FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.sync_batches(connection_id, started_at DESC);

CREATE TABLE public.source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.app_connections(id) ON DELETE CASCADE,
  sync_batch_id uuid REFERENCES public.sync_batches(id) ON DELETE SET NULL,
  provider_id text NOT NULL,
  provider_record_id text NOT NULL CHECK (char_length(provider_record_id) BETWEEN 1 AND 120),
  record_type text NOT NULL CHECK (record_type IN ('payment','order','refund','cancellation','pending','subscription','transfer')),
  status text NOT NULL CHECK (status IN ('success','failed','pending','cancelled','refunded','unknown')),
  direction text NOT NULL DEFAULT 'unknown' CHECK (direction IN ('debit','credit','unknown')),
  amount_paise bigint CHECK (amount_paise IS NULL OR (amount_paise >= 0 AND amount_paise < 100000000000)),
  occurred_at timestamptz,
  merchant_raw text CHECK (merchant_raw IS NULL OR char_length(merchant_raw) <= 200),
  merchant text CHECK (merchant IS NULL OR char_length(merchant) <= 80),
  description text CHECK (description IS NULL OR char_length(description) <= 200),
  reference text CHECK (reference IS NULL OR char_length(reference) <= 64),
  order_id text CHECK (order_id IS NULL OR char_length(order_id) <= 64),
  payment_method text CHECK (payment_method IS NULL OR char_length(payment_method) <= 60),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  interpretation text CHECK (interpretation IS NULL OR char_length(interpretation) <= 200),
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  link_role text CHECK (link_role IS NULL OR link_role IN ('created','linked')),
  match_score smallint CHECK (match_score IS NULL OR match_score BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_id, provider_record_id)
);
GRANT SELECT ON public.source_records TO authenticated;
GRANT ALL ON public.source_records TO service_role;
ALTER TABLE public.source_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own source records read" ON public.source_records FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.source_records(transaction_id);
CREATE INDEX ON public.source_records(connection_id);

CREATE TABLE public.connection_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connection_id uuid REFERENCES public.app_connections(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  event text NOT NULL CHECK (event IN ('connected','reconnected','paused','resumed','revoked','sync_completed','data_deleted')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.connection_audit_events TO authenticated;
GRANT ALL ON public.connection_audit_events TO service_role;
ALTER TABLE public.connection_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own audit read" ON public.connection_audit_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.connection_audit_events(user_id, created_at DESC);

ALTER TABLE public.transactions ADD COLUMN provider_id text CHECK (provider_id IS NULL OR provider_id ~ '^[a-z0-9_]{2,40}$');
ALTER TABLE public.transactions DROP CONSTRAINT transactions_entry_method_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_entry_method_check CHECK (entry_method IN ('manual','csv','receipt','demo','connected'));
CREATE INDEX ON public.transactions(provider_id);

-- Connect (or reconnect) a provider and record consent. Atomic.
CREATE OR REPLACE FUNCTION public.connect_app(
  p_provider_id text, p_method text, p_data_types text[], p_purpose text, p_consent_version text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); cid uuid; prev text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in before connecting'; END IF;
  IF p_provider_id IS NULL OR p_provider_id !~ '^[a-z0-9_]{2,40}$' THEN RAISE EXCEPTION 'Unknown provider'; END IF;
  IF p_method NOT IN ('file_export','statement_pdf') THEN RAISE EXCEPTION 'This connection method is not available'; END IF;
  IF p_purpose IS NULL OR char_length(p_purpose) NOT BETWEEN 1 AND 400 THEN RAISE EXCEPTION 'Consent purpose is required'; END IF;
  IF coalesce(array_length(p_data_types, 1), 0) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Choose what may be shared'; END IF;
  SELECT id, status INTO cid, prev FROM app_connections WHERE user_id = uid AND provider_id = p_provider_id AND method = p_method FOR UPDATE;
  IF cid IS NULL THEN
    INSERT INTO app_connections(user_id, provider_id, method, data_types) VALUES (uid, p_provider_id, p_method, p_data_types) RETURNING id INTO cid;
  ELSE
    UPDATE app_connections SET status = 'active', data_types = p_data_types, connected_at = CASE WHEN prev = 'revoked' THEN now() ELSE connected_at END,
      paused_at = NULL, revoked_at = NULL, updated_at = now() WHERE id = cid;
    UPDATE connection_consents SET revoked_at = now() WHERE connection_id = cid AND revoked_at IS NULL;
  END IF;
  INSERT INTO connection_consents(user_id, connection_id, provider_id, scope, purpose, consent_version)
  VALUES (uid, cid, p_provider_id, p_data_types, p_purpose, left(p_consent_version, 20));
  INSERT INTO connection_audit_events(user_id, connection_id, provider_id, event, detail)
  VALUES (uid, cid, p_provider_id, CASE WHEN prev IS NULL THEN 'connected' ELSE 'reconnected' END, jsonb_build_object('method', p_method));
  RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.connect_app(text,text,text[],text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connect_app(text,text,text[],text,text) TO authenticated, service_role;

-- Pause, resume or revoke. Revoking keeps confirmed transactions.
CREATE OR REPLACE FUNCTION public.set_connection_status(p_connection_id uuid, p_action text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); c app_connections%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT * INTO c FROM app_connections WHERE id = p_connection_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection not found'; END IF;
  IF p_action = 'pause' THEN
    IF c.status <> 'active' THEN RAISE EXCEPTION 'Only an active connection can be paused'; END IF;
    UPDATE app_connections SET status = 'paused', paused_at = now(), updated_at = now() WHERE id = c.id;
    INSERT INTO connection_audit_events(user_id, connection_id, provider_id, event) VALUES (uid, c.id, c.provider_id, 'paused');
    RETURN 'paused';
  ELSIF p_action = 'resume' THEN
    IF c.status <> 'paused' THEN RAISE EXCEPTION 'Only a paused connection can be resumed'; END IF;
    UPDATE app_connections SET status = 'active', paused_at = NULL, updated_at = now() WHERE id = c.id;
    INSERT INTO connection_audit_events(user_id, connection_id, provider_id, event) VALUES (uid, c.id, c.provider_id, 'resumed');
    RETURN 'active';
  ELSIF p_action = 'revoke' THEN
    IF c.status = 'revoked' THEN RETURN 'revoked'; END IF;
    UPDATE app_connections SET status = 'revoked', revoked_at = now(), paused_at = NULL, updated_at = now() WHERE id = c.id;
    UPDATE connection_consents SET revoked_at = now() WHERE connection_id = c.id AND revoked_at IS NULL;
    INSERT INTO connection_audit_events(user_id, connection_id, provider_id, event) VALUES (uid, c.id, c.provider_id, 'revoked');
    RETURN 'revoked';
  END IF;
  RAISE EXCEPTION 'Unknown action';
END $$;
REVOKE ALL ON FUNCTION public.set_connection_status(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_connection_status(uuid,text) TO authenticated, service_role;

-- Save one reviewed sync atomically. Idempotent per batch id; records already stored are skipped.
CREATE OR REPLACE FUNCTION public.ingest_source_records(
  p_batch_id uuid, p_connection_id uuid, p_file_name text, p_file_hash text, p_groups jsonb, p_counts jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); c app_connections%ROWTYPE; b sync_batches%ROWTYPE;
  g jsonb; r jsonb; t jsonb; act text; tid uuid; n_groups integer;
  created integer := 0; linked integer := 0; recorded integer := 0; skipped integer := 0; inserted integer := 0; k integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in before syncing'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 7));
  SELECT * INTO b FROM sync_batches WHERE id = p_batch_id;
  IF FOUND THEN
    IF b.user_id <> uid THEN RAISE EXCEPTION 'Invalid sync'; END IF;
    RETURN jsonb_build_object('batch_id', b.id, 'created', b.accepted_count, 'linked', b.linked_count, 'skipped', 0, 'repeat', true);
  END IF;
  SELECT * INTO c FROM app_connections WHERE id = p_connection_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection not found'; END IF;
  IF c.status <> 'active' THEN RAISE EXCEPTION 'CONNECTION_NOT_ACTIVE'; END IF;
  IF jsonb_typeof(p_groups) <> 'array' THEN RAISE EXCEPTION 'Invalid records'; END IF;
  n_groups := jsonb_array_length(p_groups);
  IF n_groups < 1 OR n_groups > 5000 THEN RAISE EXCEPTION 'A sync must contain between 1 and 5000 records'; END IF;

  INSERT INTO sync_batches(id, user_id, connection_id, file_name, file_hash, status)
  VALUES (p_batch_id, uid, c.id, left(p_file_name, 200), left(p_file_hash, 80), 'completed');

  FOR g IN SELECT * FROM jsonb_array_elements(p_groups) LOOP
    act := g->>'action';
    IF act NOT IN ('create','link','record_only') THEN RAISE EXCEPTION 'Invalid action'; END IF;
    IF jsonb_typeof(g->'records') <> 'array' OR jsonb_array_length(g->'records') < 1 THEN RAISE EXCEPTION 'Invalid record group'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(g->'records') x
               JOIN source_records s ON s.user_id = uid AND s.provider_id = c.provider_id AND s.provider_record_id = x->>'provider_record_id') THEN
      skipped := skipped + 1; CONTINUE;
    END IF;
    tid := NULL;
    IF act = 'create' THEN
      t := g->'txn';
      IF jsonb_typeof(t) <> 'object' THEN RAISE EXCEPTION 'Invalid transaction'; END IF;
      IF (t->>'txn_type') NOT IN ('income','expense','refund') THEN RAISE EXCEPTION 'Invalid transaction type'; END IF;
      IF (t->>'amount_paise') IS NULL OR (t->>'amount_paise')::bigint <= 0 THEN RAISE EXCEPTION 'Amount is missing'; END IF;
      IF (t->>'occurred_at') IS NULL THEN RAISE EXCEPTION 'Date is missing'; END IF;
      INSERT INTO transactions(user_id, txn_type, amount_paise, currency, description, merchant, category, occurred_at,
        payment_method, reference, notes, entry_method, provider_id, confirmation_status)
      VALUES (uid, t->>'txn_type', (t->>'amount_paise')::bigint, 'INR', left(coalesce(nullif(t->>'description',''), 'Imported transaction'), 120),
        nullif(left(t->>'merchant', 80), ''), nullif(t->>'category',''), (t->>'occurred_at')::timestamptz,
        nullif(left(t->>'payment_method', 60), ''), nullif(left(t->>'reference', 64), ''), nullif(left(t->>'notes', 500), ''),
        'connected', c.provider_id, 'user_confirmed')
      RETURNING id INTO tid;
      created := created + 1;
    ELSIF act = 'link' THEN
      tid := nullif(g->>'link_transaction_id','')::uuid;
      IF tid IS NULL OR NOT EXISTS (SELECT 1 FROM transactions WHERE id = tid AND user_id = uid) THEN RAISE EXCEPTION 'The matched transaction no longer exists'; END IF;
      linked := linked + 1;
    ELSE
      recorded := recorded + 1;
    END IF;

    FOR r IN SELECT * FROM jsonb_array_elements(g->'records') LOOP
      INSERT INTO source_records(user_id, connection_id, sync_batch_id, provider_id, provider_record_id, record_type, status, direction,
        amount_paise, occurred_at, merchant_raw, merchant, description, reference, order_id, payment_method, items, interpretation,
        transaction_id, link_role, match_score)
      VALUES (uid, c.id, p_batch_id, c.provider_id, left(r->>'provider_record_id', 120), r->>'record_type', r->>'status', coalesce(r->>'direction','unknown'),
        nullif(r->>'amount_paise','')::bigint, nullif(r->>'occurred_at','')::timestamptz, nullif(left(r->>'merchant_raw', 200), ''), nullif(left(r->>'merchant', 80), ''),
        nullif(left(r->>'description', 200), ''), nullif(left(r->>'reference', 64), ''), nullif(left(r->>'order_id', 64), ''), nullif(left(r->>'payment_method', 60), ''),
        CASE WHEN jsonb_typeof(r->'items') = 'array' AND jsonb_array_length(r->'items') <= 300 THEN r->'items' ELSE '[]'::jsonb END,
        nullif(left(r->>'interpretation', 200), ''), tid,
        CASE WHEN act = 'create' THEN 'created' WHEN act = 'link' THEN 'linked' ELSE NULL END,
        CASE WHEN act = 'link' THEN least(100, greatest(0, coalesce((g->>'match_score')::int, 0)))::smallint ELSE NULL END)
      ON CONFLICT (user_id, provider_id, provider_record_id) DO NOTHING;
      GET DIAGNOSTICS k = ROW_COUNT; inserted := inserted + k;
    END LOOP;
  END LOOP;

  UPDATE sync_batches SET
    received_count = greatest(coalesce((p_counts->>'received')::int, 0), 0),
    accepted_count = created, linked_count = linked,
    review_count = greatest(coalesce((p_counts->>'review')::int, 0), 0),
    duplicate_count = greatest(coalesce((p_counts->>'duplicates')::int, 0), 0) + skipped,
    not_counted_count = recorded,
    rejected_count = greatest(coalesce((p_counts->>'rejected')::int, 0), 0),
    error_count = greatest(coalesce((p_counts->>'errors')::int, 0), 0),
    status = CASE WHEN coalesce((p_counts->>'rejected')::int, 0) > 0 OR coalesce((p_counts->>'errors')::int, 0) > 0 THEN 'completed_with_issues' ELSE 'completed' END,
    completed_at = now()
  WHERE id = p_batch_id;
  UPDATE app_connections SET last_sync_at = now(), last_sync_status = 'completed', records_imported = records_imported + inserted, updated_at = now() WHERE id = c.id;
  INSERT INTO connection_audit_events(user_id, connection_id, provider_id, event, detail)
  VALUES (uid, c.id, c.provider_id, 'sync_completed', jsonb_build_object('batch_id', p_batch_id, 'created', created, 'linked', linked, 'recorded', recorded, 'skipped', skipped));
  RETURN jsonb_build_object('batch_id', p_batch_id, 'created', created, 'linked', linked, 'recorded', recorded, 'skipped', skipped, 'repeat', false);
END $$;
REVOKE ALL ON FUNCTION public.ingest_source_records(uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingest_source_records(uuid,uuid,text,text,jsonb,jsonb) TO authenticated, service_role;

-- Delete everything imported through one connection. Transactions that another source also confirms are kept.
CREATE OR REPLACE FUNCTION public.delete_connection_data(p_connection_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); c app_connections%ROWTYPE; n_txn integer; n_rec integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT * INTO c FROM app_connections WHERE id = p_connection_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection not found'; END IF;
  WITH doomed AS (
    SELECT DISTINCT s.transaction_id AS id FROM source_records s
    WHERE s.connection_id = c.id AND s.link_role = 'created' AND s.transaction_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM source_records o WHERE o.transaction_id = s.transaction_id AND o.connection_id <> c.id)
  ), del AS (DELETE FROM transactions t USING doomed WHERE t.id = doomed.id AND t.user_id = uid RETURNING t.id)
  SELECT count(*) INTO n_txn FROM del;
  DELETE FROM source_records WHERE connection_id = c.id AND user_id = uid;
  GET DIAGNOSTICS n_rec = ROW_COUNT;
  DELETE FROM sync_batches WHERE connection_id = c.id AND user_id = uid;
  UPDATE app_connections SET records_imported = 0, last_sync_at = NULL, last_sync_status = NULL, updated_at = now() WHERE id = c.id;
  INSERT INTO connection_audit_events(user_id, connection_id, provider_id, event, detail)
  VALUES (uid, c.id, c.provider_id, 'data_deleted', jsonb_build_object('transactions', n_txn, 'records', n_rec));
  RETURN jsonb_build_object('transactions', n_txn, 'records', n_rec);
END $$;
REVOKE ALL ON FUNCTION public.delete_connection_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_connection_data(uuid) TO authenticated, service_role;