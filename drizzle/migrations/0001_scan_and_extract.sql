CREATE TABLE public.document_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  batch_id uuid,
  file_path text,
  file_name text CHECK (file_name IS NULL OR char_length(file_name) <= 200),
  mime_type text,
  document_type text,
  user_document_type text,
  classification_confidence text CHECK (classification_confidence IS NULL OR classification_confidence IN ('high','medium','low')),
  processing_status text NOT NULL DEFAULT 'uploaded' CHECK (processing_status IN ('uploaded','processing','extracted','failed','waiting','confirmed','discarded')),
  error_code text,
  ocr_provider text,
  ocr_model text,
  extracted_payload jsonb,
  confidence_metadata jsonb,
  validation_results jsonb,
  interpretation jsonb,
  reviewed_payload jsonb,
  keep_image boolean NOT NULL DEFAULT false,
  image_deleted_at timestamptz,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_extractions TO authenticated;
GRANT ALL ON public.document_extractions TO service_role;
ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own extractions" ON public.document_extractions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.document_extractions(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_extraction() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.file_path IS NOT NULL AND split_part(NEW.file_path, '/', 1) <> NEW.user_id::text THEN
    RAISE EXCEPTION 'Invalid file path';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER extraction_touch BEFORE INSERT OR UPDATE ON public.document_extractions FOR EACH ROW EXECUTE FUNCTION public.touch_extraction();

ALTER TABLE public.transactions
  ADD COLUMN extraction_id uuid REFERENCES public.document_extractions(id) ON DELETE SET NULL,
  ADD COLUMN confirmation_status text NOT NULL DEFAULT 'confirmed' CHECK (confirmation_status IN ('confirmed','user_confirmed'));
CREATE INDEX ON public.transactions(extraction_id);

CREATE TABLE public.receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  extraction_id uuid NOT NULL REFERENCES public.document_extractions(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  original_name text NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 200),
  normalised_name text CHECK (normalised_name IS NULL OR char_length(normalised_name) <= 120),
  quantity numeric(12,3),
  unit_price_paise bigint,
  line_total_paise bigint,
  category text,
  confidence text CHECK (confidence IS NULL OR confidence IN ('high','medium','low','not_detected')),
  review_status text NOT NULL DEFAULT 'confirmed' CHECK (review_status IN ('unreviewed','confirmed','edited')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_items TO authenticated;
GRANT ALL ON public.receipt_items TO service_role;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own receipt items" ON public.receipt_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.receipt_items(transaction_id);
CREATE INDEX ON public.receipt_items(extraction_id);

CREATE TABLE public.category_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pattern text NOT NULL CHECK (char_length(pattern) BETWEEN 2 AND 60),
  match_field text NOT NULL DEFAULT 'merchant' CHECK (match_field IN ('merchant','item')),
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, match_field, pattern)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_rules TO authenticated;
GRANT ALL ON public.category_rules TO service_role;
ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own category rules" ON public.category_rules FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.data_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('image_extraction')),
  provider text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.data_consents TO authenticated;
GRANT ALL ON public.data_consents TO service_role;
ALTER TABLE public.data_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own consents read" ON public.data_consents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own consents insert" ON public.data_consents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own consents update" ON public.data_consents FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.data_consents(user_id, purpose);

CREATE POLICY "own documents read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own documents insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own documents update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own documents delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.save_extraction(
  p_extraction_id uuid, p_txn jsonb, p_items jsonb, p_allow_duplicate boolean,
  p_keep_image boolean, p_reviewed jsonb, p_validation jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); ex public.document_extractions%ROWTYPE; new_id uuid; ref text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in before saving'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_extraction_id::text, 1));
  SELECT * INTO ex FROM public.document_extractions WHERE id = p_extraction_id AND user_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scan not found'; END IF;
  IF ex.processing_status = 'confirmed' AND ex.transaction_id IS NOT NULL THEN RETURN ex.transaction_id; END IF;
  IF ex.processing_status NOT IN ('extracted','waiting') THEN RAISE EXCEPTION 'This scan is not ready to save'; END IF;
  IF jsonb_typeof(p_txn) <> 'object' THEN RAISE EXCEPTION 'Invalid transaction'; END IF;
  IF (p_txn->>'txn_type') IS NULL OR (p_txn->>'txn_type') NOT IN ('income','expense','refund','transfer') THEN RAISE EXCEPTION 'Choose what kind of transaction this is'; END IF;
  IF (p_txn->>'amount_paise') IS NULL OR (p_txn->>'amount_paise')::bigint <= 0 THEN RAISE EXCEPTION 'Amount is missing'; END IF;
  IF (p_txn->>'occurred_at') IS NULL THEN RAISE EXCEPTION 'Date is missing'; END IF;
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Invalid items'; END IF;
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 300 THEN RAISE EXCEPTION 'Too many items'; END IF;
  ref := nullif(trim(p_txn->>'reference'), '');
  IF NOT coalesce(p_allow_duplicate, false) AND ref IS NOT NULL AND length(regexp_replace(ref, '[^A-Za-z0-9]', '', 'g')) >= 6 AND EXISTS (
    SELECT 1 FROM public.transactions t WHERE t.user_id = uid
      AND lower(regexp_replace(coalesce(t.reference,''), '[^A-Za-z0-9]', '', 'g')) = lower(regexp_replace(ref, '[^A-Za-z0-9]', '', 'g'))
  ) THEN RAISE EXCEPTION 'DUPLICATE_REFERENCE'; END IF;

  INSERT INTO public.transactions(user_id, txn_type, amount_paise, currency, description, merchant, category, occurred_at,
    source_id, to_source_id, payment_method, reference, notes, entry_method, extraction_id, confirmation_status)
  VALUES (uid, p_txn->>'txn_type', (p_txn->>'amount_paise')::bigint, 'INR', left(p_txn->>'description', 120),
    nullif(left(p_txn->>'merchant', 80), ''), nullif(p_txn->>'category', ''), (p_txn->>'occurred_at')::timestamptz,
    nullif(p_txn->>'source_id','')::uuid, nullif(p_txn->>'to_source_id','')::uuid, nullif(p_txn->>'payment_method',''),
    left(ref, 64), nullif(left(p_txn->>'notes', 500), ''), 'receipt', p_extraction_id, 'user_confirmed')
  RETURNING id INTO new_id;

  IF p_items IS NOT NULL THEN
    INSERT INTO public.receipt_items(user_id, extraction_id, transaction_id, position, original_name, normalised_name, quantity,
      unit_price_paise, line_total_paise, category, confidence, review_status)
    SELECT uid, p_extraction_id, new_id, (ord - 1)::int, left(i->>'original_name', 200), nullif(left(i->>'normalised_name', 120), ''),
      nullif(i->>'quantity','')::numeric, nullif(i->>'unit_price_paise','')::bigint, nullif(i->>'line_total_paise','')::bigint,
      nullif(i->>'category',''), coalesce(nullif(i->>'confidence',''), 'medium'), coalesce(nullif(i->>'review_status',''), 'confirmed')
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(i, ord)
    WHERE length(trim(coalesce(i->>'original_name',''))) > 0;
  END IF;

  UPDATE public.document_extractions
    SET processing_status = 'confirmed', transaction_id = new_id, keep_image = coalesce(p_keep_image, false),
        reviewed_payload = p_reviewed, validation_results = coalesce(p_validation, validation_results)
    WHERE id = p_extraction_id;
  RETURN new_id;
END; $$;
REVOKE ALL ON FUNCTION public.save_extraction(uuid,jsonb,jsonb,boolean,boolean,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_extraction(uuid,jsonb,jsonb,boolean,boolean,jsonb,jsonb) TO authenticated, service_role;