/**
 * Absolute URLs for things people paste into WhatsApp.
 *
 * The invite token alone (`/e/abc123`) is not shareable — it has to carry an
 * origin. There are two ways to get one and they fail differently:
 *
 *   NEXT_PUBLIC_SITE_URL  works on the server and the client, same value
 *                         everywhere, but has to be configured.
 *   window.location.origin needs no configuration but only exists in the
 *                         browser, so a server render has nothing to emit.
 *
 * Prefer the first, fall back to the second. Deliberately NOT using
 * VERCEL_URL: it resolves to the per-deployment hostname rather than the
 * production alias, so preview builds hand out links to a deployment that
 * gets superseded — it tests fine and rots later.
 */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

/**
 * Absolute URL for an app path.
 *
 * Returns the bare path when no origin is available (server render with no
 * NEXT_PUBLIC_SITE_URL set) rather than throwing — a relative link is worse
 * than an absolute one but better than a crash, and the client render that
 * follows will fill the origin in.
 */
export function absoluteUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${siteOrigin()}${suffix}`;
}

/** Shareable link that opens a Jio's invite page. */
export function eventInviteUrl(token: string): string {
  return absoluteUrl(`/e/${token}`);
}

/** Shareable link that opens a Kaki's join page. */
export function kakiInviteUrl(token: string): string {
  return absoluteUrl(`/k/${token}`);
}

/**
 * Shareable link that opens a place's public preview — CHANGES_20260812.md
 * §4. Unlike the invite links above, there is no token: `place.id` is
 * already an unguessable UUID, and `get_public_place()` only ever serves
 * `status = 'active'` places, so it doubles as the public identifier.
 */
export function placeShareUrl(placeId: string): string {
  return absoluteUrl(`/p/${placeId}`);
}

/**
 * Shareable link for a public lobang — CHANGES_20260816.md §4, "Share this
 * lobang"'s third path. Token-keyed like the invite links above, not
 * id-keyed like `placeShareUrl`: a lobang has no natural unguessable
 * identifier of its own the way a place's UUID doubles as one, so
 * `lobangs.public_token` fills that role and `get_public_lobang()`
 * resolves it the same way `get_public_place()` resolves a place id.
 */
export function lobangShareUrl(token: string): string {
  return absoluteUrl(`/l/${token}`);
}

/**
 * Shareable link that opens a person's profile card — CHANGES_20260818.md
 * §3 / docs/user-discovery.md §4.3. Token-keyed like the invite links
 * above, not id-keyed — a user's id being public would let anyone start a
 * Jio with or add anyone to a Kaki without them ever having shared
 * anything, the same enumeration risk `discovery_token` exists to avoid.
 */
export function personalInviteUrl(token: string): string {
  return absoluteUrl(`/u/${token}`);
}
