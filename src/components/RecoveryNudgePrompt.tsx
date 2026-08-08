"use client";

import { useEffect, useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import { Button } from "./ui";
import ShareLink from "./ShareLink";
import { mutateJson } from "@/lib/fetcher";
import { config } from "@/lib/config";

const VISIT_KEY = "jio-recovery-nudge-visits";
const SNOOZE_KEY = "jio-recovery-nudge-snoozed-until";
const DONE_KEY = "jio-recovery-nudge-done";
// Higher than AddToHomeScreenPrompt's 3 (CHANGES_20260807c.md §3 item 4)
// so the two don't typically compete for the same visit — by the time this
// one would first show, the install prompt has usually already been acted
// on or snoozed for a week.
const MIN_VISITS = 6;
const SNOOZE_DAYS = 7;

/**
 * Nudges toward getting a recovery link (or attaching an email) *before*
 * it's needed — CHANGES_20260807c.md §3 item 4.
 *
 * Both exist today only as passive panels on "You" (`RecoveryLinkPanel`,
 * `AttachEmailPanel`) — opt-in-discovery, which is exactly backwards for a
 * recovery link specifically: you can't generate one for an account you can
 * no longer sign into, so the only useful moment to get it is before
 * anything goes wrong. Same pattern as `AddToHomeScreenPrompt` — surfaces
 * after a few visits, "remind me later" rather than a one-shot ask — for
 * the same reason: something worth doing that nobody thinks to go find.
 */
export default function RecoveryNudgePrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only meaningful in name mode: demo has no real identity to protect,
    // email mode's identity is already portable and never needs this.
    if (config.authAdapter !== "name" || config.isDemo) return;
    if (window.localStorage.getItem(DONE_KEY)) return;

    const visits = Number(window.localStorage.getItem(VISIT_KEY) ?? "0") + 1;
    window.localStorage.setItem(VISIT_KEY, String(visits));

    const snoozedUntil = Number(window.localStorage.getItem(SNOOZE_KEY) ?? "0");
    const snoozed = Date.now() < snoozedUntil;

    if (visits >= MIN_VISITS && !snoozed) setVisible(true);
  }, []);

  const remindLater = () => {
    window.localStorage.setItem(
      SNOOZE_KEY,
      String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)
    );
    setVisible(false);
  };

  const getLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await mutateJson<{ token: string; url: string }>(
        "/api/recovery-link",
        "POST"
      );
      setLink(`${window.location.origin}${result.url}`);
      window.localStorage.setItem(DONE_KEY, "1");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create a recovery link"
      );
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-[env(safe-area-inset-bottom)] md:bottom-4 md:left-64 md:right-4">
      <div
        className="border-line bg-cream mx-auto flex max-w-lg items-start gap-3 rounded-2xl border p-4"
        style={{ boxShadow: "var(--shadow-sm)" }}
        role="dialog"
        aria-label="Get a recovery link"
      >
        <span className="bg-ember-tint text-ember flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
          <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          {link ? (
            <>
              <p className="text-ink text-sm font-medium">You're covered</p>
              <p className="text-stone mt-1 mb-2 text-xs">
                Save this somewhere safe — it signs you straight back into
                this account if you're ever signed out unexpectedly.
              </p>
              <ShareLink
                url={link}
                label="Your recovery link"
                shareText="My Jio recovery link — keep this private."
              />
            </>
          ) : (
            <>
              <p className="text-ink text-sm font-medium">
                Don't lose access to your Jios
              </p>
              <p className="text-stone mt-1 text-xs">
                Get a recovery link now, while you're signed in — it's the
                only way back in if this browser ever forgets you.
              </p>
              {error && <p className="text-ember mt-1 text-xs">{error}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={getLink} disabled={busy}>
                  {busy ? "…" : "Get a recovery link"}
                </Button>
                <Button size="sm" variant="ghost" onClick={remindLater}>
                  Remind me later
                </Button>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={remindLater}
          aria-label="Dismiss"
          className="text-stone hover:text-ink shrink-0 p-1"
        >
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
