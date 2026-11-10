// Verifies the signature Netlify adds to outgoing form webhooks ("HTTP POST request"
// form notifications with a JWS secret). The X-Webhook-Signature header is a JWT signed
// with HS256 using the shared secret; its payload carries `sha256` = hex SHA-256 of the
// raw request body (and normally `iss: "netlify"`). Only the raw body bytes are hashed.
import { createHmac, timingSafeEqual } from "node:crypto";
import { sha256Hex } from "./util.mjs";

function b64urlDecode(part) {
  return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * @returns {{ok: true} | {ok: false, reason: string}}  reasons are safe to log
 */
export function verifyNetlifySignature(rawBody, token, secret) {
  if (!secret) return { ok: false, reason: "secret-missing" };
  if (!token || typeof token !== "string") return { ok: false, reason: "no-signature" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [h, p, s] = parts;

  let header, payload;
  try {
    header = JSON.parse(b64urlDecode(h).toString("utf8"));
    payload = JSON.parse(b64urlDecode(p).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  // Reject "none" and any algorithm other than the one we expect (algorithm-confusion attacks).
  if (!header || header.alg !== "HS256") return { ok: false, reason: "bad-alg" };

  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const given = b64urlDecode(s);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad-signature" };

  if (payload.iss !== "netlify") return { ok: false, reason: "bad-issuer" };
  if (typeof payload.sha256 !== "string") return { ok: false, reason: "no-body-hash" };
  const bodyHash = sha256Hex(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody);
  const a = Buffer.from(payload.sha256, "utf8"), b = Buffer.from(bodyHash, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "body-changed" };
  return { ok: true };
}

/** Test helper: sign a body the way Netlify does. Never used in production code paths. */
export function signForTests(rawBody, secret, extra = {}) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = enc({ alg: "HS256", typ: "JWT" });
  const p = enc({ iss: "netlify", sha256: sha256Hex(Buffer.from(rawBody, "utf8")), ...extra });
  const s = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
