import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Generic anon-key client, memoised.
 *
 * Safe on either side of the wire, since the anon key is public by design and
 * RLS is what actually protects the data.
 */
export function createClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");

  cached = createSupabaseClient(url, key);
  return cached;
}

/** Test seam. */
export function resetClient(): void {
  cached = null;
}
