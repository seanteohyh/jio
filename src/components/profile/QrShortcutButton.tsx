"use client";

import { useState } from "react";
import { CloseIcon, QrIcon } from "@/components/icons";
import ShareLink from "@/components/ShareLink";
import QrCode from "@/components/QrCode";
import type { usePersonalInviteLink } from "./PersonalInvitePanel";

/**
 * CHANGES_20260819.md §2 — a fast path into the personal invite QR right
 * from the page title, for "someone standing next to you asking to be
 * added" — the same reasoning `PersonalInvitePanel` was built on, just
 * without several scrolls of Settings and Your Activity in the way.
 *
 * Not a second code path: takes the shared `usePersonalInviteLink` state as
 * props (same shape `PersonalInvitePanel` takes), so opening this either
 * shows the link already generated this session or mints the same kind of
 * token `PersonalInvitePanel` would. That panel stays the manage/regenerate
 * surface; this is a quick-view shortcut into the same underlying link.
 *
 * The popup itself matches the app's existing bottom-sheet dialog
 * convention (`AddToHomeScreenPrompt`, `RecoveryNudgePrompt`) rather than a
 * new centered-modal pattern.
 */
export default function QrShortcutButton({
  url,
  busy,
  error,
  generate,
}: ReturnType<typeof usePersonalInviteLink>) {
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    setOpen(true);
    if (!url) generate();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Show your QR code"
        className="text-stone hover:text-ink -mr-2 shrink-0 rounded-full p-2"
      >
        <QrIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-[env(safe-area-inset-bottom)] md:bottom-4 md:left-64 md:right-4">
          <div
            className="border-line bg-cream animate-fade-in mx-auto flex max-w-lg items-start gap-3 rounded-2xl border p-4"
            style={{ boxShadow: "var(--shadow-sm)" }}
            role="dialog"
            aria-label="Your QR code"
          >
            <div className="min-w-0 flex-1">
              <p className="text-ink text-sm font-medium">Your QR code</p>
              <p className="text-stone mt-1 text-xs">
                Let someone scan this to start a Jio with you or add you to a
                Kaki — no searching required.
              </p>

              {busy && !url && (
                <p className="text-stone mt-3 text-xs">Generating…</p>
              )}

              {url && (
                <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <QrCode value={url} />
                  <div className="min-w-0 flex-1">
                    <ShareLink
                      url={url}
                      label="Your invite link"
                      shareText="Start a Jio with me on Jio"
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-ember mt-2 text-xs">{error}</p>}
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-stone hover:text-ink shrink-0 p-1"
            >
              <CloseIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
