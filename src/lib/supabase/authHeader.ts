/**
 * The request header `middleware.ts` uses to pass its already-validated
 * session forward, so every page/route (55 of them, each calling
 * `getCurrentUser()`/`requireUser()` independently) doesn't have to repeat
 * the same network round-trip to Supabase's Auth server that middleware
 * already just made. Shared as a constant, not a string literal duplicated
 * in both places, so the two ends can't quietly drift out of sync.
 *
 * Security note: this is safe *only* because `middleware.ts` unconditionally
 * overwrites (never merely appends to) this exact header on every request —
 * `Headers.set()` replaces, it doesn't add a second value — so whatever a
 * client sent never survives. Nothing downstream should ever read this
 * header directly; go through `getValidatedUser()` in `serverAuth.ts`,
 * which is the one place that both trusts it and falls back to the real
 * check when it's missing.
 */
export const AUTH_HEADER_NAME = "x-jio-auth-user";
