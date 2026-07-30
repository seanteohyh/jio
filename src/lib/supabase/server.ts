import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side data client.
 *
 * This one is deliberately boring: it ALWAYS uses the anon key, so every query
 * it makes is subject to Row Level Security. The service-role key is never
 * wired into the user-facing data path — if it were, a bug in one policy check
 * would turn into a full data leak instead of a 403.
 *
 * `tests/clients.test.ts` asserts it never falls back to the service key, even
 * when that key is sitting right there in the environment.
 */
export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  if (!key) {
    // Note: no fallback to SUPABASE_SERVICE_ROLE_KEY. Failing loudly is the
    // correct behaviour; silently escalating privileges is not.
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
