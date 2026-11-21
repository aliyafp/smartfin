/** Server function: reads a scanned document that the signed-in user uploaded to private storage. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { ExtractErrorCode } from "./types";

export type ExtractResult = { ok: true } | { ok: false; code: ExtractErrorCode; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const extractDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { extractionId: string }) => {
    if (!input || typeof input.extractionId !== "string" || !UUID.test(input.extractionId)) throw new Error("Invalid scan id");
    return { extractionId: input.extractionId };
  })
  .handler(async ({ data, context }): Promise<ExtractResult> => {
    const { supabase, userId } = context;
    const { readDocumentImage, OcrError, OCR_MODEL, OCR_PROVIDER } = await import("./ocr.server");
    const { normaliseExtraction, primaryAmount, scrubExtraction } = await import("./normalise");
    const { interpret } = await import("./interpret");
    const { runChecks } = await import("./validate");

    const fail = async (code: ExtractErrorCode, message: string): Promise<ExtractResult> => {
      await supabase.from("document_extractions").update({ processing_status: "failed", error_code: code }).eq("id", data.extractionId);
      return { ok: false, code, message };
    };

    const consent = await supabase.from("data_consents").select("id").eq("user_id", userId).eq("purpose", "image_extraction").is("revoked_at", null).limit(1);
    if (consent.error) return { ok: false, code: "service_unavailable", message: "Couldn't check your settings. Try again." };
    if (!consent.data.length) return { ok: false, code: "consent_required", message: "Agree to image processing before scanning." };

    const { data: ex, error } = await supabase.from("document_extractions").select("id, file_path, mime_type, processing_status").eq("id", data.extractionId).maybeSingle();
    if (error || !ex) return { ok: false, code: "not_found", message: "This scan no longer exists." };
    if (ex.processing_status === "confirmed" || ex.processing_status === "discarded") return { ok: false, code: "not_found", message: "This scan is already finished." };
    if (!ex.file_path) return fail("no_image", "The image is missing. Add it again.");

    await supabase.from("document_extractions").update({ processing_status: "processing", error_code: null }).eq("id", ex.id);

    const file = await supabase.storage.from("documents").download(ex.file_path);
    if (file.error || !file.data) return fail("no_image", "The uploaded image couldn't be opened. Add it again.");
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    if (bytes.length === 0) return fail("no_image", "The uploaded image is empty. Add it again.");

    try {
      const raw = scrubExtraction(await readDocumentImage(bytes, ex.mime_type ?? "image/jpeg"));
      const n = normaliseExtraction(raw);
      if (!n.readableText && primaryAmount(n) === null) {
        await supabase.from("document_extractions").update({ extracted_payload: raw as unknown as Json, ocr_provider: OCR_PROVIDER, ocr_model: OCR_MODEL }).eq("id", ex.id);
        return fail("no_text", "No readable text was found. Retake the photo flat, in good light and in focus.");
      }
      const interpretation = interpret(n);
      const checks = runChecks(n, { amountPaise: primaryAmount(n), dateIso: n.date.value });
      const confidence = {
        classification: n.classificationConfidence,
        fields: Object.fromEntries(Object.entries(raw.fields).map(([k, v]) => [k, v.value ? v.confidence : "not_detected"])),
        amounts: Object.fromEntries(Object.entries(raw.amounts).map(([k, v]) => [k, v.value ? v.confidence : "not_detected"])),
        items: raw.items.map((i) => i.confidence),
      };
      const upd = await supabase.from("document_extractions").update({
        processing_status: "extracted",
        error_code: null,
        document_type: n.documentType,
        classification_confidence: n.classificationConfidence,
        ocr_provider: OCR_PROVIDER,
        ocr_model: OCR_MODEL,
        extracted_payload: raw as unknown as Json,
        confidence_metadata: confidence as unknown as Json,
        interpretation: interpretation as unknown as Json,
        validation_results: checks as unknown as Json,
      }).eq("id", ex.id);
      if (upd.error) return fail("save_failed", "The reading couldn't be saved. Try again.");
      return { ok: true };
    } catch (e) {
      if (e instanceof OcrError) return fail(e.code, e.message);
      console.error("extractDocument failed", e instanceof Error ? e.name : "unknown");
      return fail("service_unavailable", "The document couldn't be read right now. Try again.");
    }
  });
