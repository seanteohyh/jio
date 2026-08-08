import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** Every cookie currently visible to this page's JS, in the shape
 *  `@supabase/ssr` expects back from `getAll()`. */
function readDocumentCookies(): { name: string; value: string }[] {
  if (typeof document === "undefined" || !document.cookie) return [];
  return document.cookie.split("; ").map((pair) => {
    const eq = pair.indexOf("=");
    return {
      name: eq === -1 ? pair : pair.slice(0, eq),
      value: eq === -1 ? "" : decodeURIComponent(pair.slice(eq + 1)),
    };
  });
}

/**
 * Browser-side client — Realtime only, never the session's source of truth.
 *
 * CHANGES_20260807c.md §4: the one thing this client is for is authenticating
 * a Realtime websocket, which needs *reading* the current session's token,
 * never writing one. Left at its defaults, `createBrowserClient` gets no
 * `cookies` adapter and falls back to managing the session itself via plain
 * `document.cookie` — and with `autoRefreshToken` on (the default), just
 * constructing this client starts an internal refresh loop that can write a
 * session cookie from client-side JS the moment any page mounting Realtime
 * loads, not only once an hour near actual expiry. Safari's Intelligent
 * Tracking Prevention treats a script-written cookie differently from one set
 * by a real `Set-Cookie` response header (which is how every other session
 * write in this app happens, via `middleware.ts`/`serverAuth.ts`) — plausibly
 * explaining a sign-out that reproduces in minutes on iOS specifically,
 * regardless of the access token's real ~1 hour lifetime.
 *
 * Fixed at the root rather than tuned around: `setAll` is a deliberate no-op,
 * so nothing this client does — the disabled auto-refresh timer, or any
 * inline refresh-on-read some future code path might trigger — can ever
 * write a cookie, full stop. `getAll` still reads whatever the server most
 * recently set, so Realtime keeps authenticating with a real, current token.
 * The trade-off: if a tab sits open with no navigation for over an hour, the
 * token backing its Realtime connection can go stale, since neither this
 * client nor the server-side middleware (which only runs on navigation) will
 * refresh it. Live updates lagging on a very long idle tab is a soft failure
 * a page reload fixes; it is not the same class of problem as being signed
 * out.
 */
export function createAuthBrowserClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");

  cached = createBrowserClient(url, key, {
    auth: { autoRefreshToken: false },
    cookies: {
      getAll: readDocumentCookies,
      setAll: () => {
        // Deliberately does nothing — see the doc comment above.
      },
    },
  });
  return cached;
}
