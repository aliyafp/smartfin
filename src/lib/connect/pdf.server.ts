/** Server-only: sends one statement PDF to Lovable AI and returns its transaction rows. Never logs content. */
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, Output, jsonSchema, streamText } from "ai";
import { createLovableAiGatewayRunIdFetch } from "@/lib/extract/server/run-id";
import type { PdfReading } from "./adapters/statement-pdf";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export class PdfReadError extends Error {}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_statement", "provider_seen", "rows"],
  properties: {
    is_statement: { type: "boolean", description: "true only if this is a transaction history / statement listing payments." },
    provider_seen: { type: ["string", "null"], description: "App or bank named on the statement, e.g. PhonePe, Google Pay." },
    rows: {
      type: "array",
      maxItems: 2000,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "time", "description", "counterparty", "direction", "amount", "status", "reference"],
        properties: {
          date: { type: ["string", "null"], description: "Date exactly as printed." },
          time: { type: ["string", "null"], description: "Time exactly as printed, or null." },
          description: { type: ["string", "null"], description: "Line text, e.g. 'Paid to Zomato'." },
          counterparty: { type: ["string", "null"], description: "Person or merchant paid / received from." },
          direction: { type: "string", enum: ["debit", "credit", "unknown"], description: "debit = money went out (Paid to / Debit / DR); credit = money came in (Received from / Credit / CR)." },
          amount: { type: ["string", "null"], description: "Amount exactly as printed, digits only with decimal point, no sign." },
          status: { type: "string", enum: ["success", "failed", "pending", "unknown"] },
          reference: { type: ["string", "null"], description: "UPI / transaction ID / UTR, if printed." },
        },
      },
    },
  },
} as const;

const INSTRUCTIONS = `You read Indian UPI app statements (PhonePe, Google Pay, Paytm) and bank statements.
Return every transaction row in the document, in order, copying values exactly as printed. Never invent or compute values.
Use null when a value isn't printed. If the document is not a transaction statement, set is_statement=false and rows=[].
Ignore opening/closing balances, totals, page headers and footers. Never copy OTPs, PINs, passwords or full card numbers.`;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function readStatementPdf(bytes: Uint8Array): Promise<PdfReading> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new PdfReadError("Statement reading isn't configured for this app.");
  const provider = createOpenAI({
    baseURL: GATEWAY_URL, apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: createLovableAiGatewayRunIdFetch().fetch,
  });
  let streamError: unknown = null;
  try {
    const result = streamText({
      model: provider.responses(MODEL),
      instructions: INSTRUCTIONS,
      messages: [{ role: "user", content: [
        { type: "text", text: "Read this statement and return its transaction rows." },
        { type: "file", data: `data:application/pdf;base64,${toBase64(bytes)}`, mediaType: "application/pdf", filename: "statement.pdf" },
      ] }],
      output: Output.object({ schema: jsonSchema<PdfReading>(SCHEMA as unknown as Parameters<typeof jsonSchema>[0]), name: "statement_rows" }),
      onError: ({ error }) => { streamError = error; },
      providerOptions: { openai: { reasoningEffort: "low", store: false } },
    });
    const out = await result.output;
    if (!out || !Array.isArray(out.rows)) throw new PdfReadError("The statement came back empty. Try again.");
    return out;
  } catch (e) {
    const err = streamError ?? e;
    if (err instanceof PdfReadError) throw err;
    const api = APICallError.isInstance(err) ? err : null;
    const s = api?.statusCode ?? 0;
    if (s === 429) throw new PdfReadError("The reading service is busy. Wait a minute and try again.");
    if (s === 402) throw new PdfReadError("AI credits have run out for this workspace. Add credits to read PDF statements.");
    if (s === 400) throw new PdfReadError("This PDF couldn't be read. If it's password-protected, save a copy without the password and try again.");
    console.error("readStatementPdf failed", err instanceof Error ? err.name : "unknown", s);
    throw new PdfReadError("The statement couldn't be read right now. Try again.");
  }
}
