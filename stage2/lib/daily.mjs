// Daily check (weekdays, 6pm UK): keeps each open enquiry's status up to date and sends at most
// one "no reply found after 2 working days" reminder per enquiry (or per chain of enquiries from
// one person). It never deletes or sends mail.
//
// A reply only counts if it was sent to the enquirer AND its subject carries one of the
// enquiry's references. (A sent template draft carries its reference, so it counts the same way,
// whatever ID Outlook gives it once sent.) An unrelated email to the same person, or the Stage 1
// acknowledgement, never counts. Deleting a draft does NOT close an enquiry: only a reply does.
//
// It also catches problems the webhook couldn't report: an enquiry stuck part-way, a notice that
// could not be delivered, and a draft label that could not be changed.
import { workingDaysSince, holidaysOutOfDate } from "./workdays.mjs";
import { noticeText } from "./notify.mjs";
import { tidy } from "./handler.mjs";
import { CATEGORIES } from "./compose.mjs";
import { keyedHash } from "./util.mjs";
import { subjectHasRef } from "./graph.mjs";

const OPEN = new Set(["draft-ready", "sensitive", "manual", "follow-up", "failed"]);
const STUCK_MS = 10 * 60 * 1000;

export async function dailyCheck({ store, graph, notify, log, env = {}, now = () => Date.now() }) {
  const t = now();
  const summary = { checked: 0, answered: 0, answeredDeleteDraft: 0, reminders: 0, recovered: 0, errors: 0, holidaysOutOfDate: holidaysOutOfDate(t) };
  const { blobs = [] } = (await store.list({ prefix: "rec/" })) || {};
  const recs = new Map();
  for (const b of blobs) recs.set(b.key, await store.get(b.key, { type: "json" }));
  const mine = (rec) => !(env.DRAFTS_MAILBOX && rec.mailbox && rec.mailbox !== env.DRAFTS_MAILBOX);
  const tell = async (n) => { try { await notify(n); return true; } catch { return false; } };

  // 1. Problems the webhook couldn't report.
  for (const [k, rec] of recs) {
    if (!rec) continue;
    if (rec.status === "processing" && t - rec.at > STUCK_MS) {
      // Stopped part-way (e.g. a time-out). The reference isn't stored yet, so the notice can't name it.
      if (await tell(noticeText({ ref: "unknown", status: "failed", extra: "An enquiry stopped part-way through Stage 2. Please check today's Netlify enquiry notifications and reply to any you haven't answered." }))) {
        await store.setJSON(k, { ...rec, status: "stuck-reported" });
        summary.recovered++;
      }
      continue;
    }
    if (!mine(rec)) continue;
    if (rec.noticeFailed && OPEN.has(rec.status)) {
      if (await tell(noticeText({ ref: rec.ref, status: "failed", extra: `The notice for ${rec.ref} couldn't be delivered when it arrived. Please read its Netlify notification and decide how to reply.` }))) {
        rec.noticeFailed = false;
        await store.setJSON(k, rec);
        summary.recovered++;
      }
    }
    if (rec.relabelPending && rec.chainDraftId) {
      try {
        const m = await graph.getMessage(rec.chainDraftId);
        if (m && m.isDraft && !m.deleted) await graph.setCategory(rec.chainDraftId, rec.relabelPending);
        rec.relabelPending = null;
        await store.setJSON(k, rec);
        summary.recovered++;
      } catch { summary.errors++; }
    }
  }

  // 2. Open enquiries: one scan of Sent Items for all of them.
  const open = [...recs].filter(([, r]) => r && OPEN.has(r.status) && mine(r) && !r.followedUpBy);
  let sent = [];
  if (open.length) {
    const since = open.map(([, r]) => r.createdIso).sort()[0];
    try {
      sent = await graph.sentSince(since);
    } catch {
      summary.errors += open.length;
      log({ fn: "stage2-daily", ...summary, stage: "sent-items" });
      await tidy(store, t);
      return summary; // without Sent Items, no reminders: better than false ones
    }
  }
  for (const [k, rec] of open) {
    summary.checked++;
    try {
      const refs = rec.refs || [rec.ref];
      const replied = sent.some((m) => m.at >= rec.createdIso && subjectHasRef(m.subject, refs)
        && m.recipients.some((a) => keyedHash(a, env.STAGE2_HASH_SECRET) === rec.toHash));
      const draftId = rec.draftId || rec.chainDraftId;
      if (replied) {
        // If an unsent draft is still waiting (you replied another way), flag it so it isn't sent twice.
        let leftover = false;
        if (draftId) {
          const m = await graph.getMessage(draftId);
          if (m && m.isDraft && !m.deleted) {
            await graph.setCategory(draftId, CATEGORIES.answeredElsewhere);
            leftover = true;
          }
        }
        await store.setJSON(k, { ...rec, status: leftover ? "answered-delete-draft" : "answered" });
        leftover ? summary.answeredDeleteDraft++ : summary.answered++;
        continue;
      }
      if (!rec.reminded && workingDaysSince(rec.createdIso, t) >= 2) {
        if (await tell(noticeText({ ref: refs.join(" / "), status: "reminder" }))) {
          await store.setJSON(k, { ...rec, reminded: true });
          summary.reminders++;
        }
      }
    } catch {
      summary.errors++;
    }
  }

  await tidy(store, t);
  // Out-of-date bank holidays: a maintenance notice once a week (Mondays), not every day.
  if (summary.holidaysOutOfDate && new Date(t).getUTCDay() === 1) {
    await tell(noticeText({ ref: "-", status: "maintenance", extra: "The bank holiday list in Stage 2 needs updating for this year." }));
  }
  log({ fn: "stage2-daily", ...summary });
  return summary;
}
