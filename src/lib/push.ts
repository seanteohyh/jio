import webpush from "web-push";
import type { Repo } from "./data";

/**
 * Sends a web push to every subscribed device for a set of users — §6.
 *
 * No-ops (logs and returns) when VAPID keys aren't configured, matching
 * migration 025's original documented intent: a deploy that hasn't set up
 * push yet should behave exactly as if this file didn't exist, not throw
 * partway through an otherwise-successful action like closing a Jio.
 *
 * Deliberately swallows per-subscription send failures rather than
 * propagating them — a push notification is a courtesy on top of the real
 * action (inviting someone, closing a vote), never a condition for it
 * succeeding. A dead subscription (the browser revoked it, the user
 * uninstalled) is expected background noise, not an error worth surfacing
 * to whoever's request triggered the send.
 *
 * Still reports back exactly who was actually reached (`succeededUserIds`)
 * — every existing call site is fire-and-forget and can go on ignoring it,
 * but the one call site where the push itself *is* the entire point (the
 * reminder cron, which one-shot-claims a reminder before this ever runs)
 * needs to know whether a "sent" reminder actually landed anywhere, so a
 * failed send can be un-claimed and retried on the next scan instead of
 * silently lost forever.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Path to open on click, e.g. `/events/abc123`. Defaults to `/`. */
  url?: string;
}

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushSendResult {
  /** A user counts as reached once at least one of their devices actually
   *  got the push — someone with two subscriptions, one dead and one live,
   *  is still reached. */
  succeededUserIds: string[];
}

/** Sends to every subscribed device belonging to `userIds`. Safe to call
 *  with an empty array or with ids that have no subscriptions at all. */
export async function sendPushToUsers(
  repo: Repo,
  userIds: string[],
  payload: PushPayload
): Promise<PushSendResult> {
  if (userIds.length === 0) return { succeededUserIds: [] };
  if (!ensureConfigured()) {
    console.log(
      `[push] VAPID not configured — skipping "${payload.title}" to ${userIds.length} user(s)`
    );
    return { succeededUserIds: [] };
  }

  const targets = await repo.getPushTargets(userIds);
  if (targets.length === 0) return { succeededUserIds: [] };

  const body = JSON.stringify(payload);
  const succeeded = new Set<string>();

  await Promise.all(
    targets.map(async (target) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.authKey },
          },
          body
        );
        succeeded.add(target.userId);
      } catch (error) {
        // A dead endpoint (410 Gone / 404) is routine, not a bug — the
        // subscription is left in place rather than deleted here, since
        // deleting someone else's row needs the same elevated path as
        // reading it (see migration 037) and this is a best-effort path,
        // not one worth a second RPC per failure. It'll get overwritten
        // next time that browser subscribes again, or cleaned up manually.
        console.log(
          `[push] send failed for ${target.endpoint.slice(0, 40)}…:`,
          error instanceof Error ? error.message : error
        );
      }
    })
  );

  return { succeededUserIds: [...succeeded] };
}
