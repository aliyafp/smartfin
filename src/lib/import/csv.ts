import Papa from "papaparse";
import { detectColumns } from "./statement";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;

export class StatementFileError extends Error {}

/** Check the chosen file before reading it. Returns a friendly message or null. */
export function checkStatementFile(file: { name: string; size: number; type: string }): string | null {
  const name = file.name.toLowerCase();
  if (/\.(xlsx?|xls|numbers|ods)$/.test(name)) return "This is a spreadsheet file. Open it and save or export it as CSV, then choose the CSV file.";
  if (name.endsWith(".pdf")) return "PDF statements can't be read yet. Download the CSV version of your statement from your bank or app.";
  if (!name.endsWith(".csv") && !(file.type === "text/csv" || file.type === "application/vnd.ms-excel")) return "Please choose a .csv file.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_FILE_BYTES) return "This file is larger than 5 MB. Split it into smaller date ranges and import them one at a time.";
  return null;
}

/** Read CSV text into header + row objects. Throws StatementFileError with a friendly message. */
export function readStatementCsv(text: string) {
  const clean = text.replace(/^\uFEFF/, "");
  if (!clean.trim()) throw new StatementFileError("This file is empty.");
  if (clean.startsWith("%PDF") || clean.startsWith("PK") || /\u0000/.test(clean.slice(0, 2000))) {
    throw new StatementFileError("This doesn't look like a CSV text file. It may be a PDF or Excel file renamed to .csv.");
  }
  const parsed = Papa.parse<string[]>(clean, { skipEmptyLines: "greedy" });
  const fatal = parsed.errors.find((e) => e.type === "Quotes");
  if (fatal) throw new StatementFileError(`The CSV couldn't be read near row ${fatal.row ?? "?"}: a quote mark isn't closed. Re-export the file and try again.`);
  if (!parsed.data.length) throw new StatementFileError("No rows were found in this file.");
  // Statements often start with a few lines of account details before the real header row.
  const headerIndex = parsed.data.findIndex((row) => {
    const mapping = detectColumns(row.map((c) => c.trim()));
    return Boolean(mapping.date && (mapping.description || mapping.merchant) && (mapping.amount || mapping.debit || mapping.credit));
  });
  const index = headerIndex < 0 ? 0 : headerIndex;
  const headers = (parsed.data[index] ?? []).map((h) => h.trim());
  // Drop fully blank trailing header cells (common with trailing commas).
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  if (headers.length < 2) throw new StatementFileError("We couldn't find column headings in this file. The first row should name each column, like Date, Narration, Amount.");
  const fixed = headers.map((h, i) => h || `Column ${i + 1}`);
  const counts = new Map<string, number>();
  const unique = fixed.map((h) => { const n = (counts.get(h) ?? 0) + 1; counts.set(h, n); return n > 1 ? `${h} (${n})` : h; });
  const body = parsed.data.slice(index + 1);
  if (!body.length) throw new StatementFileError("This CSV has headings but no transaction rows.");
  if (body.length > MAX_ROWS) throw new StatementFileError(`This file has ${body.length.toLocaleString("en-IN")} rows. Import up to ${MAX_ROWS.toLocaleString("en-IN")} at a time by choosing a shorter date range.`);
  const shapeErrors = new Map<number, string>();
  const rows = body.map((cells, i) => {
    const extra = cells.slice(unique.length).filter((c) => c.trim());
    if (extra.length) shapeErrors.set(i + 1, `This row has ${cells.length} values but the file has ${unique.length} columns — an amount may contain an unquoted comma`);
    return Object.fromEntries(unique.map((h, j) => [h, (cells[j] ?? "").trim()]));
  });
  return { headers: unique, rows, mapping: detectColumns(unique), skippedLines: index, shapeErrors };
}
