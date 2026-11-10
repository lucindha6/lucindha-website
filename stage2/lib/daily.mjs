// Daily check (weekdays, 6pm UK): keeps each open enquiry's status up to date and sends at most
// one "no reply found after 2 working days" reminder per enquiry. It never deletes or sends mail.
//
// A reply only counts if it was sent to the enquirer AND its subject carries the enquiry's
// reference (or the template draft itself was sent). An unrelated email to the same person, or
// the Stage 1 acknowledgement, never counts.
import { workingDaysSince, holidaysOutOfDate } from "./workdays.mjs";
import { noticeText } from "./notify.mjs";
import { tidy } from "./handler.mjs";
import { CATEGORIES } from "./compose.mjs";
import { keyedHash } from "./util.mjs";

const OPEN = new Set(["draft-ready", "sensitive", "manual", "follow-up"]);

export async function dailyCheck({ store, graph, notify, log, env = {}, now = () => Date.now() }) {
  const t = now();
  const summary = { checked: 0, answered: 0, answeredDeleteDraft: 0, closed: 0, reminders: 0, errors: 0, holidaysOutOfDate: holidaysOutOfDate(t) };
  const { blobs = [] } = (await store.list({ prefix: "rec/" })) || {};
  const recs = new Map();
  for (const b of blobs) recs.set(b.key, await store.get(b.key, { type: "json" }));

  for (const [k, rec] of recs) {
    if (!rec || !OPEN.has(rec.status)) continue;
    if (env.DRAFTS_MAILBOX && rec.mailbox && rec.mailbox !== env.DRAFTS_MAILBOX) continue;
    // An enquiry followed up by a later one is tracked through the follow-up, whose references
    // cover both (one reminder, not two).
    if (rec.followedUpBy) continue;
    summary.checked++;
    try {
      const refs = rec.refs || [rec.ref];
      let draft = null;
      if (rec.draftId) {
        draft = await graph.getMessage(rec.draftId);
        if (!draft || draft.deleted) {
          // You deleted the draft without sending it: you rejected it or replied another way.
          await store.setJSON(k, { ...rec, status: "closed" });
          summary.closed++;
          continue;
        }
        if (!draft.isDraft) {
          await store.setJSON(k, { ...rec, status: "answered" });
          summary.answered++;
          continue;
        }
      }
      // Records hold only a keyed fingerprint of the enquirer's address, never the address itself.
      const recipients = await graph.sentRecipientsWithRef(refs, rec.createdIso);
      if (recipients.some((a) => keyedHash(a, env.STAGE2_HASH_SECRET) === rec.toHash)) {
        if (draft) {
          // You replied separately; flag the unused draft so it isn't sent by mistake.
          await graph.setCategory(rec.draftId, CATEGORIES.answeredElsewhere);
          await store.setJSON(k, { ...rec, status: "answered-delete-draft" });
          summary.answeredDeleteDraft++;
        } else {
          await store.setJSON(k, { ...rec, status: "answered" });
          summary.answered++;
        }
        continue;
      }
      if (!rec.reminded && workingDaysSince(rec.createdIso, t) >= 2) {
        await notify(noticeText({ ref: refs.join(" / "), status: "reminder" }));
        await store.setJSON(k, { ...rec, reminded: true });
        summary.reminders++;
      }
    } catch {
      summary.errors++;
    }
  }
  await tidy(store, t);
  if (summary.holidaysOutOfDate) {
    try { await notify(noticeText({ ref: "-", status: "maintenance", extra: "The bank holiday list in Stage 2 needs updating for this year." })); } catch { /* logged below */ }
  }
  log({ fn: "stage2-daily", ...summary });
  return summary;
}
