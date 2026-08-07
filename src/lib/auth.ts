import { getAuth } from "./auth/adapter";
import { UnauthenticatedError } from "./auth/index";
import type { AuthUser } from "@/types";

/**
 * The two functions the rest of the app actually calls.
 *
 * Kept at `lib/auth.ts` rather than inside `lib/auth/` so that every page and
 * route has one obvious import, whichever adapter is configured underneath.
 */

/** The signed-in user, or null. Safe to call anywhere on the server. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const auth = await getAuth();
  const user = await auth.getCurrentUser();

  // Temporary diagnostic — the "still logs out on iOS after closing all
  // tabs" follow-up to CHANGES_20260804.md §1/CHANGES_20260807.md §1.
  // Every code-level theory (sessionStorage, cookie maxAge, middleware,
  // domain drift) has been ruled out by inspection; this is the one
  // measurement left that distinguishes "no cookie arrived" from "a cookie
  // arrived but the session behind it was rejected." Names only, never
  // values — cookie values are live session tokens. Remove once the cause
  // is confirmed.
  if (!user) {
    try {
      const { cookies } = await import("next/headers");
      const names = (await cookies()).getAll().map((c) => c.name);
      console.log(
        `[auth-debug] getCurrentUser() found nobody. Cookies present: ${
          names.length > 0 ? names.join(", ") : "(none)"
        }`
      );
    } catch (err) {
      console.log(
        `[auth-debug] getCurrentUser() found nobody, and couldn't read cookies to say why: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return user;
}

/**
 * The signed-in user, or throw.
 *
 * Every mutating API route calls this first. The route wrapper in
 * `lib/api.ts` turns the thrown error into a 401.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export { UnauthenticatedError, getAuth };
