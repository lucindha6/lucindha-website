// Weekdays at 18:00 UTC (6pm UK in winter, 7pm in summer).
import { getStore } from "@netlify/blobs";
import { dailyCheck } from "../../lib/daily.mjs";
import { realGraph } from "../../lib/graph.mjs";
import { formNotifier } from "../../lib/notify.mjs";

export default async () => {
  const env = process.env;
  const mode = String(env.DRAFT_MODE || "off").toLowerCase();
  if (mode !== "test" && mode !== "live") return new Response("disabled");
  await dailyCheck({
    store: getStore({ name: "stage2", consistency: "strong", region: "eu-central-1" }),
    graph: realGraph(env),
    notify: formNotifier(env.URL),
    log: (o) => console.log(JSON.stringify(o)),
  });
  return new Response("ok");
};

export const config = { schedule: "0 18 * * 1-5" };
