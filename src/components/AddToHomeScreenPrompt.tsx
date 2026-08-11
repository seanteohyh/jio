"use client";

import { useEffect, useState } from "react";
import { X, Share, PlusSquare, Smartphone } from "lucide-react";
import { Button } from "./ui";
import { useInstallPrompt } from "./InstallPromptProvider";
import AttachEmailPanel from "./profile/AttachEmailPanel";
import { config } from "@/lib/config";

const VISIT_KEY = "jio-a2hs-visits";
const SNOOZE_KEY = "jio-a2hs-snoozed-until";
const MIN_VISITS = 3;
// Not specified when this was raised (CHANGES_20260804.md §2 left it as an
// open question) — 7 days is long enough not to nag on every session, short
// enough that "remind me later" still means something before this stops
// mattering. Easy to retune later; nothing else depends on this exact number.
const SNOOZE_DAYS = 7;

/**
 * Nudges toward installing to the home screen — CHANGES_20260804.md §2.
 *
 * Not a nicety: iOS only ever delivers Web Push to an installed PWA, never a
 * plain Safari tab, and can't even ask for notification permission from one.
 * Every push trigger built after this (§6) is unreachable for an iOS user
 * who never sees this prompt.
 *
 * Two real install paths, handled differently because the platforms don't
 * offer the same mechanism:
 * - **Android / desktop Chrome-family**: `beforeinstallprompt` fires and can
 *   be replayed on demand via `.prompt()` — a real "Install" button.
 * - **iOS Safari**: no such event exists at all. The only way in is manual
 *   (Share → Add to Home Screen), so this shows instructions instead of a
 *   button that would do nothing.
 * Anything else (desktop Firefox, etc.) has no reliable install path to
 * explain, so nothing renders there.
 *
 * Also the anchor for a second nudge — CHANGES_20260807c_1.md §7: installing
 * the icon is the exact moment a second, independent storage context is
 * about to exist (browser tab + home-screen icon, on iOS genuinely separate
 * sessions — see §6/§5). Pairing "want this on your home screen?" with
 * "since you'll be using two places, want an email so they both just work?"
 * addresses that at the moment it becomes relevant, rather than as a
 * generically-timed, separately-discovered option (the recovery-link nudge
 * already does that timing for a different case — this one is deliberately
 * tied to install specifically). `name` mode only: `email` mode's identity
 * is already portable, nothing to fix.
 */
export default function AddToHomeScreenPrompt() {
  const { platform, standalone, install: installViaPrompt } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  // Android/Chrome: shown after a successful install, since .prompt()'s
  // accepted/dismissed outcome is a real signal. iOS has no such signal —
  // there's no way to know someone actually completed Share → Add to Home
  // Screen — so its instructions and this offer sit together from the
  // start instead of being sequenced.
  const [showEmailNudge, setShowEmailNudge] = useState(false);
  const [iosEmailOpen, setIosEmailOpen] = useState(false);
  const offerEmail = config.authAdapter === "name";

  useEffect(() => {
    if (standalone) return;

    // "A visit" is an app open, not a page navigation — this component lives
    // in the root layout and only mounts once per load, so counting on
    // mount already means once per open rather than once per route change.
    const visits = Number(window.localStorage.getItem(VISIT_KEY) ?? "0") + 1;
    window.localStorage.setItem(VISIT_KEY, String(visits));

    const snoozedUntil = Number(
      window.localStorage.getItem(SNOOZE_KEY) ?? "0"
    );
    const snoozed = Date.now() < snoozedUntil;

    if (visits >= MIN_VISITS && !snoozed) setVisible(true);
  }, [standalone]);

  const remindLater = () => {
    window.localStorage.setItem(
      SNOOZE_KEY,
      String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)
    );
    setVisible(false);
  };

  const install = async () => {
    // Accepted or not, don't ask again this session — a "no" just now
    // shouldn't reappear the moment they click somewhere else.
    const outcome = await installViaPrompt();
    if (outcome === "dismissed") remindLater();
    else if (outcome === "accepted") {
      if (offerEmail) setShowEmailNudge(true);
      else setVisible(false);
    }
  };

  if (!visible || !platform) return null;

  if (showEmailNudge) {
    return (
      <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-[env(safe-area-inset-bottom)] md:bottom-4 md:left-64 md:right-4">
        <div
          className="border-line bg-cream mx-auto flex max-w-lg items-start gap-3 rounded-2xl border p-4"
          style={{ boxShadow: "var(--shadow-sm)" }}
          role="dialog"
          aria-label="Attach an email"
        >
          <span className="bg-ember-tint text-ember flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
            <Smartphone className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-ink text-sm font-medium">Installed.</p>
            <p className="text-stone mt-1 mb-2 text-xs">
              You now have two places signed in — this tab and the new icon.
              On this browser they're separate sessions, so attach an email
              and they'll both just work as the same account, no juggling.
            </p>
            <AttachEmailPanel onAttached={() => setVisible(false)} />
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="text-stone mt-2 text-xs underline"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-[env(safe-area-inset-bottom)] md:bottom-4 md:left-64 md:right-4">
      <div
        className="border-line bg-cream mx-auto flex max-w-lg items-start gap-3 rounded-2xl border p-4"
        style={{ boxShadow: "var(--shadow-sm)" }}
        role="dialog"
        aria-label="Add Jio to your home screen"
      >
        <span className="bg-ember-tint text-ember flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
          <Smartphone className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-ink text-sm font-medium">
            Get Jio on your home screen
          </p>
          {platform === "ios" ? (
            <p className="text-stone mt-1 text-xs">
              Install it and you'll be able to get notified when a Jio needs
              your vote — no more finding out after everyone's already
              decided. Tap{" "}
              <Share
                className="mx-0.5 inline h-3.5 w-3.5 -translate-y-px"
                strokeWidth={1.75}
                aria-hidden="true"
              />{" "}
              Share, then{" "}
              <PlusSquare
                className="mx-0.5 inline h-3.5 w-3.5 -translate-y-px"
                strokeWidth={1.75}
                aria-hidden="true"
              />{" "}
              Add to Home Screen.
            </p>
          ) : null}
          {platform === "ios" && offerEmail && (
            <div className="mt-2">
              {iosEmailOpen ? (
                <AttachEmailPanel onAttached={() => setVisible(false)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setIosEmailOpen(true)}
                  className="text-ember text-xs underline"
                >
                  Also attach an email, so this tab and the new icon stay in
                  sync
                </button>
              )}
            </div>
          )}
          {platform !== "ios" && (
            <p className="text-stone mt-1 text-xs">
              Install it and you'll be able to get notified when a Jio needs
              your vote — no more finding out after everyone's already
              decided.
            </p>
          )}

          <div className="mt-3 flex gap-2">
            {platform === "chrome" && (
              <Button size="sm" onClick={install}>
                Install
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={remindLater}>
              Remind me later
            </Button>
          </div>
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
