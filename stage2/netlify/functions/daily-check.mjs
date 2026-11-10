// Weekdays at 18:00 UTC (6pm UK in winter, 7pm in summer).
import { getStore } from "@netlify/blobs";
import { dailyCheck } from "../../lib/daily.mjs";
import { realGraph } from "../../lib/graph.mjs";
import { mailboxNotifier } from "../../lib/notify.mjs";
import { configMissing } from "../../lib/handler.mjs";

export default async () => {
  const env = process.env;
  const mode = String(env.DRAFT_MODE || "off").toLowerCase();
  if (mode !== "test" && mode !== "live") return new Response("disabled");
  if (configMissing(env).length) return new Response("not configured");
  try {
    const graph = realGraph(env);
    await dailyCheck({
      env,
      store: getStore({ name: "stage2", consistency: "strong", region: "eu-central-1" }),
      graph,
      notify: mailboxNotifier(graph),
      log: (o) => console.log(JSON.stringify(o)),
    });
  } catch {
    console.log(JSON.stringify({ fn: "stage2-daily", result: "error" }));
  }
  return new Response("ok");
};

export const config = { schedule: "0 18 * * 1-5" };
