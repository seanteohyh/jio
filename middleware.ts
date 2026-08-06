import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Demo mode / a misconfigured deploy has no Supabase project to talk to —
  // nothing to refresh, so fall through rather than throwing on every request.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mirror onto the request too, not just the response — a route
        // handler later in this same request reads from `request.cookies`,
        // and it should see the refreshed session, not the stale one it
        // arrived with.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // The call itself is what triggers the refresh-if-needed logic — the
  // return value isn't used here, only the cookies it sets via setAll above.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
