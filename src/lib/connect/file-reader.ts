/** Browser-side file reading for provider exports: size/type checks, text, Excel rows, hash. */
import Papa from "papaparse";
import type { MethodSpec } from "./providers";

export const MAX_EXPORT_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_BYTES = 8 * 1024 * 1024;

export function checkExportFile(file: { name: string; size: number }, m: MethodSpec): string | null {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? `.${name.split(".").pop()}` : "";
  const allowed = m.accept.split(",").filter((a) => a.startsWith("."));
  if (file.size === 0) return "This file is empty.";
  if (ext === ".zip") return "This is the .zip download. Unzip it first, then choose the file inside.";
  if (!allowed.includes(ext)) return `Choose ${m.fileLabel}.`;
  if (m.method === "statement_pdf" && file.size > MAX_PDF_BYTES) return "This PDF is larger than 8 MB. Download a shorter date range.";
  if (file.size > MAX_EXPORT_BYTES) return "This file is larger than 10 MB. Download a shorter date range.";
  return null;
}

export async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Excel cells → strings the statement parsers understand (DD/MM/YYYY dates, HH:MM:SS times). */
export function cellToString(c: unknown): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) {
    if (c.getUTCFullYear() < 1901) return `${pad(c.getUTCHours())}:${pad(c.getUTCMinutes())}:${pad(c.getUTCSeconds())}`;
    return `${pad(c.getUTCDate())}/${pad(c.getUTCMonth() + 1)}/${c.getUTCFullYear()}`;
  }
  return String(c);
}

export async function readRows(file: File): Promise<string[][]> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    return Papa.parse<string[]>(text, { skipEmptyLines: "greedy" }).data;
  }
  const { readSheet } = await import("read-excel-file/browser");
  try {
    const rows = await readSheet(file);
    return rows.map((r) => r.map(cellToString));
  } catch {
    throw new Error("This Excel file couldn't be opened. Download the statement again, or save it as CSV and try that.");
  }
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
