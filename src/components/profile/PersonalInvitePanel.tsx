"use client";

import { useState } from "react";
import { Button, ErrorNote } from "@/components/ui";
import ShareLink from "@/components/ShareLink";
import QrCode from "@/components/QrCode";
import { mutateJson } from "@/lib/fetcher";

/**
 * The generate-and-display logic behind the personal invite link, lifted
 * out of the panel below so the QR shortcut icon in the page header
 * (`QrShortcutButton`, CHANGES_20260819.md §2) can share the exact same
 * token rather than minting a second one — called once by the page and
 * passed down to both, "session" scope falls out of that for free (it's
 * just React state living as long as the page does).
 */
export function usePersonalInviteLink() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await mutateJson<{ token: string; url: string }>(
        "/api/personal-invite",
        "POST"
      );
      // `result.url` is already absolute — `/api/personal-invite` builds it
      // with `personalInviteUrl()`, which resolves the real origin
      // server-side (see `siteOrigin()` in `shareUrl.ts`). Prepending
      // `window.location.origin` unconditionally, like the sibling
      // recovery-link flows do, double-glued the origin on
      // (https://host + https://host/u/token) since those flows'
      // `/api/recovery-link` returns a bare path and this one doesn't.
      setUrl(
        typeof window !== "undefined" && !/^https?:\/\//i.test(result.url)
          ? `${window.location.origin}${result.url}`
          : result.url
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create an invite link"
      );
    } finally {
      setBusy(false);
    }
  };

  return { url, busy, error, generate };
}

/**
 * Self-service personal invite link — CHANGES_20260818.md §3 / docs/user-
 * discovery.md §4.3. Opening it shows the profile card for whoever's name
 * is on it, with "Start a Jio with them" / "Add them to a Kaki" — no
 * friend-edge created just by viewing. Mirrors `RecoveryLinkPanel` (same
 * "can't read an old one back, only mint a fresh one" shape) plus a QR
 * code, since the real context here is an office — the person is across
 * the room, not across the internet.
 *
 * Stays exactly where it is in the Account zone — the manage/regenerate
 * surface. The header's QR shortcut is a quick-view into this same token,
 * not a replacement for it, which is why both take the shared invite state
 * as props rather than each owning their own.
 */
export default function PersonalInvitePanel({
  url,
  busy,
  error,
  generate,
}: ReturnType<typeof usePersonalInviteLink>) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-ink text-sm font-medium">Your invite link</p>
          <p className="text-stone text-xs">
            Share it, or show the QR code, so a teammate can start a Jio with
            you or add you to a Kaki — no searching required.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={generate} disabled={busy}>
          {busy ? "…" : url ? "Get a new one" : "Get my link"}
        </Button>
      </div>
      {url && (
        <>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <QrCode value={url} />
            <div className="min-w-0 flex-1">
              <ShareLink
                url={url}
                label="Your invite link"
                shareText="Start a Jio with me on Jio"
              />
            </div>
          </div>
          <p className="text-stone text-xs">
            Getting a new one retires this link — only the newest one works.
          </p>
        </>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
