import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_HEADER_NAME } from "@/lib/supabase/authHeader";

/**
 * Refreshes the Supabase session cookie on every request — CHANGES_20260804.md
 * §1, the "identity lost on close/reopen" bug.
 *
 * `@supabase/ssr`'s access token is short-lived; staying signed in depends on
 * the refresh token rotating it before it expires. That rotation has to
 * write a new cookie, and **Server Components cannot set cookies** (see the
 * comment in `lib/supabase/serverAuth.ts`) — without this middleware,
 * nothing in the request pipeline ever could, so a refreshed token was
 * computed and then silently discarded on every request past the first.
 * Once the access token outlived its lifetime, `getUser()` started failing
 * for real, `getCurrentUser()` returned null, and the app read that as
 * "never signed in" — which is exactly what sends a returning user back
 * through onboarding into a brand-new anonymous identity, orphaning
 * everything tied to the old one.
 *
 * This is the one piece of the pipeline that *can* set cookies before a
 * Server Component ever runs, so it's also the one place this can actually
 * be fixed — a Server Component or route handler retrying the refresh
 * itself would hit the identical "can't persist it" wall.
 *
 * It's also the one place that's already paying for a `getUser()` network
 * round-trip to Supabase's Auth server on every request — every page and
 * route handler downstream was independently paying for that same call
 * again via its own `getCurrentUser()`. The validated result is now passed
 * forward via `AUTH_HEADER_NAME` so they can skip it — see
 * `getValidatedUser()` in `lib/supabase/serverAuth.ts` for the consumer
 * side, and `authHeader.ts` for why overwriting this unconditionally on
 * every request is what makes trusting it safe.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Demo mode / a misconfigured deploy has no Supabase project to talk to —
  // nothing to refresh, so fall through rather than throwing on every request.
  if (!url || !key) return NextResponse.next({ request });

  // Captured rather than applied to a `response` built mid-flight — the
  // final response has to carry both these cookies *and* the auth header
  // below, and the header's value isn't known until after `getUser()`
  // resolves, which is also what triggers this callback. Building the one
  // real response after both are known avoids constructing it twice and
  // quietly dropping whichever one was applied to the earlier instance.
  let refreshedCookies: {
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }[] = [];

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mirror onto the request too, not just deferred to the response —
        // a route handler later in this same request reads from
        // `request.cookies`, and it should see the refreshed session, not
        // the stale one it arrived with.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        refreshedCookies = cookiesToSet;
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  // Always set, authenticated or not — never merely left alone. `.set()`
  // replaces rather than appends, so this is the only value any code
  // downstream will ever see for this header, regardless of what a client
  // sent on the original request.
  if (data.user) {
    request.headers.set(
      AUTH_HEADER_NAME,
      JSON.stringify({
        id: data.user.id,
        email: data.user.email ?? null,
        display_name:
          (data.user.user_metadata?.display_name as string | undefined) ??
          null,
      })
    );
  } else {
    request.headers.delete(AUTH_HEADER_NAME);
  }

  const response = NextResponse.next({ request });
  for (const { name, value, options } of refreshedCookies) {
    response.cookies.set(name, value, options);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
