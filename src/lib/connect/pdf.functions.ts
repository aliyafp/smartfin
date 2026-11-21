/** Server function: reads a statement PDF for a provider the signed-in user has actively connected. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PdfReading } from "./adapters/statement-pdf";

export type PdfReadResult = { ok: true; reading: PdfReading } | { ok: false; message: string };
const MAX_B64 = Math.ceil((8 * 1024 * 1024 * 4) / 3) + 8;

export const readStatementPdfFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionId: string; pdfBase64: string }) => {
    if (!input || typeof input.connectionId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.connectionId)) throw new Error("Invalid connection");
    if (typeof input.pdfBase64 !== "string" || input.pdfBase64.length < 16 || input.pdfBase64.length > MAX_B64) throw new Error("The PDF is missing or larger than 8 MB");
    return { connectionId: input.connectionId, pdfBase64: input.pdfBase64 };
  })
  .handler(async ({ data, context }): Promise<PdfReadResult> => {
    const { data: conn, error } = await context.supabase.from("app_connections").select("id, status, method").eq("id", data.connectionId).maybeSingle();
    if (error || !conn) return { ok: false, message: "Connect this app first." };
    if (conn.status !== "active") return { ok: false, message: "This connection is paused or disconnected. Resume it to import." };
    if (conn.method !== "statement_pdf") return { ok: false, message: "This connection doesn't use PDF statements." };
    const bin = atob(data.pdfBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") return { ok: false, message: "This file isn't a PDF." };
    if (/\/Encrypt\b/.test(bin.slice(0, 200_000)) || /\/Encrypt\b/.test(bin.slice(-20_000))) {
      return { ok: false, message: "This PDF is password-protected. Open it, save a copy without the password, and choose that copy." };
    }
    const { readStatementPdf, PdfReadError } = await import("./pdf.server");
    try {
      return { ok: true, reading: await readStatementPdf(bytes) };
    } catch (e) {
      return { ok: false, message: e instanceof PdfReadError ? e.message : "The statement couldn't be read right now. Try again." };
    }
  });
