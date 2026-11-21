/** Server-only: sends one document image to Lovable AI and returns the structured reading. */
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, Output, jsonSchema, streamText } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./server/run-id";
import { EXTRACTION_INSTRUCTIONS, EXTRACTION_JSON_SCHEMA } from "./ai-schema";
import type { ExtractErrorCode, RawExtraction } from "./types";

export const OCR_PROVIDER = "Lovable AI Gateway";
export const OCR_MODEL = "openai/gpt-6-astra";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";

export class OcrError extends Error {
  constructor(public code: ExtractErrorCode, message: string) { super(message); }
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function safeMessage(e: APICallError): string {
  try {
    const body = JSON.parse(e.responseBody ?? "{}") as { message?: unknown; error?: { message?: unknown } };
    const m = typeof body.message === "string" ? body.message : typeof body.error?.message === "string" ? body.error.message : null;
    if (m) return m.slice(0, 300);
  } catch { /* fall through */ }
  return "";
}

function mapError(e: unknown): OcrError {
  if (e instanceof OcrError) return e;
  const api = APICallError.isInstance(e) ? e : APICallError.isInstance((e as { cause?: unknown })?.cause) ? ((e as { cause: APICallError }).cause) : null;
  if (api) {
    const s = api.statusCode ?? 0;
    const msg = safeMessage(api);
    if (s === 429) return new OcrError("busy", "The reading service is busy. Wait a minute and try again.");
    if (s === 402) return new OcrError("credits", msg || "AI credits have run out for this workspace. Add credits to keep scanning.");
    if (s === 403) return new OcrError("blocked", msg || "Image reading is currently blocked for this workspace.");
    if (s === 408 || s === 504) return new OcrError("timeout", "Reading took too long. Try again, or use a smaller, clearer photo.");
    if (s >= 500) return new OcrError("service_unavailable", "The reading service is unavailable right now. Try again shortly.");
    if (s === 400) return new OcrError("bad_response", "This image couldn't be processed. Try a JPG or PNG photo.");
  }
  if (e instanceof Error && (e.name === "AbortError" || /timed?\s*out|timeout/i.test(e.message))) return new OcrError("timeout", "Reading took too long. Try again.");
  return new OcrError("service_unavailable", "The document couldn't be read right now. Try again.");
}

/** Reads the image. Throws OcrError with a user-safe message on failure. Never logs document content. */
export async function readDocumentImage(bytes: Uint8Array, mimeType: string, signal?: AbortSignal): Promise<RawExtraction> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new OcrError("service_unavailable", "Image reading isn't configured for this app.");
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  let streamError: unknown = null;
  try {
    const result = streamText({
      model: provider.responses(OCR_MODEL),
      instructions: EXTRACTION_INSTRUCTIONS,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Read this document image and return the structured extraction." },
          { type: "image", image: new URL(`data:${mimeType};base64,${toBase64(bytes)}`) },
        ],
      }],
      output: Output.object({ schema: jsonSchema<RawExtraction>(EXTRACTION_JSON_SCHEMA as unknown as Parameters<typeof jsonSchema>[0]), name: "document_extraction" }),
      ...(signal ? { abortSignal: signal } : {}),
      onError: ({ error }) => { streamError = error; },
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const output = await result.output;
    if (!output || typeof output !== "object") throw new OcrError("bad_response", "The reading came back empty. Try again with a clearer photo.");
    return output;
  } catch (e) {
    if (streamError) throw mapError(streamError);
    if (e instanceof Error && e.name === "AI_NoObjectGeneratedError") throw new OcrError("bad_response", "The document couldn't be read reliably. Try a clearer photo.");
    throw mapError(e);
  }
}
