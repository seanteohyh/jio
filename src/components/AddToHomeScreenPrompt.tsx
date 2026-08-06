"use client";

import { useEffect, useState } from "react";
import { X, Share, PlusSquare, Smartphone } from "lucide-react";
import { Button } from "./ui";

const VISIT_KEY = "jio-a2hs-visits";
const SNOOZE_KEY = "jio-a2hs-snoozed-until";
const MIN_VISITS = 3;
// Not specified when this was raised (CHANGES_20260804.md §2 left it as an
// open question) — 7 days is long enough not to nag on every session, short
// enough that "remind me later" still means something before this stops
// mattering. Easy to retune later; nothing else depends on this exact number.
const SNOOZE_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag — display-mode media query support there is
    // spotty enough not to rely on alone.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

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
 */
export default function AddToHomeScreenPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "chrome" | null>(null);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setPlatform("chrome");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    if (isIos()) setPlatform("ios");

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

    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const remindLater = () => {
    window.localStorage.setItem(
      SNOOZE_KEY,
      String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)
    );
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    // Accepted or not, don't ask again this session — a "no" just now
    // shouldn't reappear the moment they click somewhere else.
    if (outcome === "dismissed") remindLater();
    else setVisible(false);
  };

  if (!visible || !platform) return null;

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
          ) : (
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
