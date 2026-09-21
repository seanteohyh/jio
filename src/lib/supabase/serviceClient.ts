import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

// This module must never end up in a browser bundle. The check throws at
// import time, so a stray client-side import fails immediately and loudly
// rather than shipping a service-role key to every visitor.
//
// Note this is deliberately NOT a "use server" module: that directive would
// expose the factory as a callable Server Action, which is the opposite of
// what we want.
if (typeof window !== "undefined") {
  throw new Error(
    "serviceClient.ts is server-only and must never be imported from client code"
  );
}

/**
 * Admin client. Bypasses RLS entirely.
 *
 * Every caller so far shares the same "no user session at all" reason: a
 * cron/external-scheduler hit with nobody signed in, where RLS's per-user
 * scoping has nothing to scope to. The discovery cron needs to write into
 * the review queue this way. Account merge (CHANGES_20260807.md §4/§5,
 * `mergeUserAccounts`) needs it to delete the old, now-empty `auth.users`
 * row once `merge_user_accounts` (migration 040) has moved everything off
 * it — that's an Auth Admin API operation, not a table write, so there's no
 * RLS policy that could ever grant it instead; service role is the only
 * way in. The weekly recap cron (`listReviewLikesSince`,
 * CHANGES_20260814.md §3) needs it for the same reason as discovery —
 * reading across every user's review_likes is exactly what
 * `review_likes_select`'s owner-only RLS policy is meant to block for
 * anyone else. The "starting soon" reminder scan
 * (`listAndClaimDueReminders`, CHANGES_20260821c.md §1) and the vote-
 * deadline sweep (`closeEventsPastVoteDeadline`/
 * `listAndClaimVoteDeadlineReminders`, 088_vote_deadline.sql) are the same
 * "no session, cross-user read/claim/write" shape again, both hit by an
 * external scheduler rather than any Vercel cron — the deadline close in
 * particular reuses `computeWinner` (TypeScript, not SQL) rather than a
 * second Borda implementation in plpgsql. (A full-consensus auto-close
 * used to be a sixth caller here, for a different reason — the RSVP/vote
 * that made it true usually wasn't the host's own request, so
 * `lunch_events_update`'s host-only RLS couldn't cover it either. That
 * path closed a Jio the instant every *current* participant had answered,
 * which turned out to be unsafe for a Jio anyone could still join via its
 * own share link — see `computeReadyToClose`'s doc comment in
 * `src/lib/voting.ts`. It's gone; closing now only ever happens through
 * the host's own explicit request, or this file's deadline sweep.)
 * Anything else should be using `createServerClient()` and going through
 * RLS like everyone else.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
