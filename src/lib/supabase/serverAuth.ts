import { createServerClient as createSSRClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_HEADER_NAME } from "./authHeader";
import type { AuthUser } from "@/types";

/**
 * Cookie-backed Supabase client for server components and route handlers.
 *
 * Uses the anon key like everything else user-facing; the session cookie is
 * what tells Postgres who `auth.uid()` is, and RLS does the rest.
 */
export async function createAuthServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");

  const cookieStore = await cookies();

  return createSSRClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[]
      ) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components are not allowed to set cookies. That is fine:
          // the middleware / route handler that owns the response will have
          // refreshed the session already.
        }
      },
    },
  });
}

/**
 * The signed-in user, resolved without a second network round-trip when
 * possible — `nameAuth.ts` and `supabaseAuth.ts` both call this instead of
 * their own `client.auth.getUser()`, since it's the identical check either
 * way.
 *
 * `middleware.ts` already validates the session against Supabase's Auth
 * server on every request; the fast path here just reads what it found via
 * `AUTH_HEADER_NAME` (see that file's doc comment for why trusting it is
 * safe). Falls through to the real `getUser()` call whenever the header
 * isn't present at all — a local dev edge case, middleware not covering
 * some route, or anything else — so this is purely an optimization, never
 * the only path that can resolve who's signed in. A header that *is*
 * present but fails to parse is treated as "not signed in" rather than
 * falling through, same as any other unexpected error here: shouldn't
 * happen since middleware only ever writes valid JSON or deletes the
 * header outright, and failing closed is the safe default if it somehow did.
 */
export async function getValidatedUser(): Promise<AuthUser | null> {
  try {
    const headerValue = (await headers()).get(AUTH_HEADER_NAME);
    if (headerValue) return JSON.parse(headerValue) as AuthUser;

    const client = await createAuthServerClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;

    return {
      id: data.user.id,
      email: data.user.email ?? null,
      display_name:
        (data.user.user_metadata?.display_name as string | undefined) ??
        null,
    };
  } catch {
    return null;
  }
}
