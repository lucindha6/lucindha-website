// Receives the signed "HTTP POST request" form notification from the main website's
// `enquiry` form. Runs on the SEPARATE Stage 2 Netlify site, which holds only Stage 2 secrets.
import { getStore } from "@netlify/blobs";
import { handleWebhook } from "../../lib/handler.mjs";
import { realGraph } from "../../lib/graph.mjs";
import { realAi } from "../../lib/ai.mjs";
import { formNotifier } from "../../lib/notify.mjs";
import facts from "../../config/approved-facts.json" with { type: "json" };

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let raw, store;
  try {
    raw = Buffer.from(await req.arrayBuffer()); // exact bytes, so the signed hash matches
    store = getStore({ name: "stage2", consistency: "strong", region: "eu-central-1" });
  } catch {
    console.log(JSON.stringify({ fn: "stage2", result: "error", stage: "startup" }));
    return new Response("error", { status: 500 }); // Netlify may retry; nothing was processed
  }
  const env = process.env;
  const result = await handleWebhook(raw, req.headers.get("x-webhook-signature"), {
    env,
    store,
    graph: realGraph(env),
    ai: realAi(), // Phase 1: disabled. A real provider is only added after your approval.
    notify: formNotifier(env.URL),
    facts,
    log: (o) => console.log(JSON.stringify(o)),
  });
  return new Response(result.result, { status: result.status });
};
