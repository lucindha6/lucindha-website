// Two identifiers per enquiry:
//
// 1. The INTERNAL key: a full SHA-256 of Netlify's unique submission id (64 hex characters).
//    Every stored record is keyed by it, so two different enquiries can never overwrite or
//    block each other, whatever their short references look like.
// 2. The SHORT reference you see (e.g. ENQ-7KQ3MX): 6 easy-to-read characters (about 887 million
//    combinations). It is RESERVED atomically against the internal key, so if two enquiries ever
//    produced the same 6 characters, the second one is given a different reference instead.
import { sha256Hex } from "./util.mjs";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const REF_LEN = 6;

export function internalKey(submissionId) {
  return sha256Hex(Buffer.from(`ll-enq:${submissionId}`));
}

/** Candidate references for one key, in a fixed order (so a retry gets the same answer). */
export function referenceCandidates(key, count = 8) {
  const out = [];
  for (let c = 0; c < count; c++) {
    const h = sha256Hex(Buffer.from(`ll-ref:${c}:${key}`));
    let s = "";
    for (let i = 0; i < REF_LEN; i++) s += ALPHABET[parseInt(h.slice(i * 4, i * 4 + 4), 16) % ALPHABET.length];
    out.push(`ENQ-${s}`);
  }
  return out;
}

/** Reserves a reference no other enquiry holds. Returns null only if every candidate is taken. */
export async function reserveReference(store, key, now, candidates = referenceCandidates(key)) {
  for (const ref of candidates) {
    const r = await store.setJSON(`ref/${ref}`, { key, at: now }, { onlyIfNew: true });
    if (r?.modified === true) return ref;
    const holder = await store.get(`ref/${ref}`, { type: "json" });
    if (holder?.key === key) return ref; // a retry of the same enquiry
  }
  return null;
}

export const REF_PATTERN = /^ENQ-[A-HJKMNP-Z2-9]{6}$/;
