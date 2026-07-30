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
  return auth.getCurrentUser();
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
