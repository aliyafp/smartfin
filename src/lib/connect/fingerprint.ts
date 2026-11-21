/** Deterministic short id for rows that have no provider id (FNV-1a, 2×32-bit). Not for security. */
export function fingerprint(...parts: (string | number | null | undefined)[]): string {
  const s = parts.map((p) => String(p ?? "")).join("|");
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `fp_${h1.toString(36)}${h2.toString(36)}`;
}

/** SHA-256 of file bytes in hex, for sync history. Browser and worker safe. */
export async function fileHash(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
