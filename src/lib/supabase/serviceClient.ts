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
 * Two callers are allowed. The discovery cron needs to write into the
 * review queue with no user session. Account merge (CHANGES_20260807.md
 * §4/§5, `mergeUserAccounts`) needs it to delete the old, now-empty
 * `auth.users` row once `merge_user_accounts` (migration 040) has moved
 * everything off it — that's an Auth Admin API operation, not a table
 * write, so there's no RLS policy that could ever grant it instead;
 * service role is the only way in. Anything else should be using
 * `createServerClient()` and going through RLS like everyone else.
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
