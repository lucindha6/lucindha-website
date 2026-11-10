// Daily check (weekdays, 6pm UK): keeps each open enquiry's status up to date and sends
// at most one "no reply after 2 working days" reminder per enquiry. It never deletes or sends mail.
import { workingDaysSince } from "./workdays.mjs";
import { noticeText } from "./notify.mjs";

const OPEN = new Set(["draft-ready", "sensitive", "manual"]);

export async function dailyCheck({ store, graph, notify, log, now = () => Date.now() }) {
  const t = now();
  const summary = { checked: 0, answered: 0, answeredDeleteDraft: 0, closed: 0, reminders: 0, errors: 0 };
  const { blobs = [] } = (await store.list({ prefix: "rec/" })) || {};
  for (const b of blobs) {
    const rec = await store.get(b.key, { type: "json" });
    if (!rec || !OPEN.has(rec.status)) continue;
    summary.checked++;
    try {
      const msg = rec.draftId ? await graph.getMessage(rec.draftId) : null;
      if (!msg) {
        // Draft deleted without being sent: you rejected it or replied another way.
        await store.setJSON(b.key, { ...rec, status: "closed" });
        summary.closed++;
        continue;
      }
      if (!msg.isDraft) {
        // You sent the draft (it moved to Sent Items, same immutable id).
        await store.setJSON(b.key, { ...rec, status: "answered" });
        summary.answered++;
        continue;
      }
      if (await graph.hasReplySince(msg.to, rec.createdIso)) {
        // You replied separately; the unused draft is still waiting – flag it so it isn't sent by mistake.
        await graph.setCategory(rec.draftId, "Answered – delete draft");
        await store.setJSON(b.key, { ...rec, status: "answered-delete-draft" });
        summary.answeredDeleteDraft++;
        continue;
      }
      if (!rec.reminded && workingDaysSince(rec.createdIso, t) >= 2) {
        await notify(noticeText({ ref: rec.ref, status: "reminder" }));
        await store.setJSON(b.key, { ...rec, reminded: true });
        summary.reminders++;
      }
    } catch {
      summary.errors++;
    }
  }
  log({ fn: "stage2-daily", ...summary });
  return summary;
}
