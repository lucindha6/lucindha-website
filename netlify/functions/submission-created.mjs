// Netlify runs this automatically after each *verified* (non-spam) form submission.
// Netlify signs the event and checks the signature before calling this function,
// so it cannot be triggered from outside. The file name must stay "submission-created".
//
// It is switched off unless the ACK_MODE environment variable is "test" or "live".
// It never changes or blocks the form itself, or Netlify's own notification email.

import { getStore } from "@netlify/blobs";
import { handleSubmission } from "../lib/ack.mjs";

export default async (req) => {
  let payload = null;
  try {
    ({ payload } = await req.json());
  } catch {
    console.log(JSON.stringify({ fn: "enquiry-ack", result: "skipped", reason: "unreadable-event" }));
    return new Response("ok");
  }

  const env = {
    ACK_MODE: process.env.ACK_MODE,
    ACK_FROM: process.env.ACK_FROM,
    ACK_ALERT_TO: process.env.ACK_ALERT_TO,
    ACK_TEST_ALLOWLIST: process.env.ACK_TEST_ALLOWLIST,
    ACK_HASH_SECRET: process.env.ACK_HASH_SECRET,
    M365_TENANT_ID: process.env.M365_TENANT_ID,
    M365_CLIENT_ID: process.env.M365_CLIENT_ID,
    M365_CLIENT_SECRET: process.env.M365_CLIENT_SECRET,
  };

  // Only open the store when it might be needed (keeps "off" mode free of side effects).
  const mode = String(env.ACK_MODE || "off").toLowerCase();
  // Kept in the EU (Frankfurt). It only ever holds submission ids and scrambled email fingerprints.
  let store = null;
  if (mode === "test" || mode === "live") {
    try {
      store = getStore({ name: "enquiry-acks", consistency: "strong", region: "eu-central-1" });
    } catch {
      store = null; // handled below: the owner is alerted and no acknowledgement is sent
    }
  }

  // Failure alerts go through a hidden Netlify form, so Netlify emails them even if
  // the Microsoft connection is broken (for example an expired client secret).
  const siteUrl = process.env.URL;
  const alertViaForm = siteUrl
    ? async (message) => {
        const res = await fetch(siteUrl + "/forms/ack-alert.html", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ "form-name": "ack-alert", "bot-field": "", message }),
          redirect: "manual",
          signal: AbortSignal.timeout(3000),
        });
        return res.status < 400;
      }
    : null;

  await handleSubmission(payload, {
    env,
    fetchFn: fetch,
    store,
    alertViaForm,
    log: (o) => console.log(JSON.stringify(o)),
  });

  // Always succeed: the enquiry is already saved and Netlify's own notification still goes out.
  return new Response("ok");
};
