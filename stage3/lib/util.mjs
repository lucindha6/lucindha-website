// Small helpers (copied, not imported, from Stage 2 so the stages stay independent).
import { createHash, createHmac } from "node:crypto";

export const sha256Hex = (buf) => createHash("sha256").update(buf).digest("hex");
/** Keyed, one-way fingerprint (e.g. of an email address) so records never hold the address itself. */
export const keyedHash = (value, secret) => {
  if (!secret) throw new Error("hash-secret-missing");
  return createHmac("sha256", secret).update(String(value).trim().toLowerCase()).digest("hex");
};
export const clean = (v, max = 500) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
export function referenceCandidates(prefix, key, count = 8) {
  const out = [];
  for (let c = 0; c < count; c++) {
    const h = sha256Hex(`ll-s3:${prefix}:${c}:${key}`);
    let s = "";
    for (let i = 0; i < 6; i++) s += ALPHABET[parseInt(h.slice(i * 4, i * 4 + 4), 16) % ALPHABET.length];
    out.push(`${prefix}-${s}`);
  }
  return out;
}
export const REF_PATTERN = /\b(CMP|DSR|MED)-[A-HJKMNP-Z2-9]{6}\b/;
