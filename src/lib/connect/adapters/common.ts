/** Small helpers shared by provider file parsers. Pure. */
import { parseStatementAmount } from "@/lib/import/statement";
import type { RecordStatus } from "../types";

export const MAX_RECORDS = 5000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", emsp: " ", ensp: " ", thinsp: " " };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Parse "₹1,250.00", "INR 250", "Rs. 99", "-₹50" into paise and sign. */
export function parseMoney(raw: string | null | undefined): { paise: number; sign: 1 | -1 | 0 } | null {
  if (!raw) return null;
  const s = raw.replace(/['"]/g, "").replace(/₹/g, "").replace(/^([+-])\s+/, "$1").replace(/^([+-]?)\s*(inr|rs\.?)\s*/i, "$1").trim();
  return parseStatementAmount(s);
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/**
 * Parse Google-style timestamps: "Jan 5, 2024, 1:23:45 PM IST", "5 Jan 2024, 13:23:45 GMT+05:30", ISO strings.
 * Times without a zone are treated as India time (IST, UTC+05:30).
 */
export function parseTimestamp(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = raw.replace(/\u202f|\u00a0/g, " ").trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; }
  const m1 = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  const m2 = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  let y: number, mo: number | undefined, d: number;
  if (m1) { mo = MONTHS[m1[1]!.slice(0, 3).toLowerCase()]; d = +m1[2]!; y = +m1[3]!; }
  else if (m2) { mo = MONTHS[m2[2]!.slice(0, 3).toLowerCase()]; d = +m2[1]!; y = +m2[3]!; }
  else return null;
  if (mo === undefined || d < 1 || d > 31) return null;
  let hh = 0, mm = 0, ss = 0;
  const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i);
  if (t) {
    hh = +t[1]!; mm = +t[2]!; ss = +(t[3] ?? 0);
    const ap = t[4]?.toLowerCase().replace(/\./g, "");
    if (ap === "pm" && hh < 12) hh += 12;
    if (ap === "am" && hh === 12) hh = 0;
    if (hh > 23 || mm > 59 || ss > 59) return null;
  }
  let offsetMin = 330; // IST default
  const z = s.match(/(?:GMT|UTC)\s*([+-])(\d{1,2}):?(\d{2})?/i);
  if (z) offsetMin = (z[1] === "-" ? -1 : 1) * (+z[2]! * 60 + +(z[3] ?? 0));
  else if (/\b(UTC|GMT|Z)\b/.test(s)) offsetMin = 0;
  const utc = Date.UTC(y, mo, d, hh, mm, ss) - offsetMin * 60_000;
  const out = new Date(utc);
  return Number.isNaN(out.getTime()) ? null : out;
}

export function statusFromText(text: string): RecordStatus {
  if (/\b(fail(ed|ure)?|declined|rejected|unsuccessful)\b/i.test(text)) return "failed";
  if (/\b(pending|processing|in\s*progress|awaiting)\b/i.test(text)) return "pending";
  if (/\bcancel(l)?ed\b/i.test(text)) return "cancelled";
  if (/\brefunded\b/i.test(text)) return "refunded";
  if (/\b(completed?|success(ful)?|paid|received|closed|delivered|shipped)\b/i.test(text)) return "success";
  return "unknown";
}

export const UPI_REF_RE = /\b(?:upi\s*(?:transaction\s*id|ref(?:erence)?(?:\s*no\.?)?|txn\s*id)|utr(?:\s*no\.?)?|transaction\s*id)\s*[:#-]?\s*([A-Za-z0-9]{8,30})/i;
