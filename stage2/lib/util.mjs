// Small shared helpers for Stage 2. Deliberately copied (not imported) from Stage 1,
// because Stage 2 is built and deployed as a separate Netlify site.
import { createHmac, createHash } from "node:crypto";

const CONTROL = /[\u0000-\u001f\u007f]/g;

export function clean(value, max = 500) {
  if (value == null) return "";
  if (Array.isArray(value)) value = value.join(", ");
  return String(value).replace(CONTROL, " ").trim().slice(0, max);
}

export function asList(value) {
  if (value == null || value === "") return [];
  const list = Array.isArray(value) ? value : String(value).split(",");
  return list.map((v) => clean(v, 80)).filter(Boolean);
}

export function isValidEmail(email) {
  if (!email || email.length > 254) return false;
  return /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(email);
}

const LINKISH = /(https?:\/\/|www\.|\.[a-z]{2,}\b|<|>|@|\[url|\/\/)/i;

/** First name for the greeting (added by our code, never by the AI), or "". */
export function firstName(fullName) {
  const name = clean(fullName, 100);
  if (!name || LINKISH.test(name)) return "";
  const first = name.split(/\s+/)[0];
  if (!/^[\p{L}][\p{L}'’-]{0,29}$/u.test(first)) return "";
  if (first === first.toLowerCase()) return first.charAt(0).toUpperCase() + first.slice(1);
  return first;
}

export function keyedHash(value, secret) {
  if (!secret) throw new Error("hash-secret-missing");
  return createHmac("sha256", secret).update(String(value).trim().toLowerCase()).digest("hex");
}

export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function joinNatural(items) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}
