"use client";

import { createContext, useContext, useEffect, useState } from "react";

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

type InstallPlatform = "ios" | "chrome" | null;

interface InstallPromptValue {
  /** `null` once resolved on a platform with no reliable install path
   *  (desktop Firefox, etc.) — nothing should render there either. */
  platform: InstallPlatform;
  standalone: boolean;
  /** Only meaningful when `platform === "chrome"`. Resolves "unavailable"
   *  if called before the browser has actually offered install. */
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

const InstallPromptContext = createContext<InstallPromptValue | null>(null);

/**
 * One shared capture of the browser's install affordances, consumed by both
 * the auto-prompt (`AddToHomeScreenPrompt`) and the manual "Add to Home
 * Screen" card on the profile page — CHANGES_20260804.md §2, extended.
 *
 * `beforeinstallprompt` fires once per page load, at a moment the browser
 * chooses, only to whichever listeners are registered *right then*. Two
 * independent `useEffect` listeners racing for the same one-shot event would
 * mean whichever component mounted second reliably misses it. Lifting the
 * listener up to a single provider mounted at the root fixes that: it is
 * always there before the event can fire, and every consumer reads the same
 * captured state instead of gambling on mount order.
 */
export function InstallPromptProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [platform, setPlatform] = useState<InstallPlatform>(null);
  const [standalone, setStandalone] = useState(false);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) {
      setStandalone(true);
      return;
    }

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setPlatform("chrome");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    if (isIos()) setPlatform("ios");

    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const install = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!installEvent) return "unavailable";
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") {
      setStandalone(true);
      setInstallEvent(null);
    }
    return outcome;
  };

  return (
    <InstallPromptContext.Provider value={{ platform, standalone, install }}>
      {children}
    </InstallPromptContext.Provider>
  );
}

export function useInstallPrompt(): InstallPromptValue {
  const ctx = useContext(InstallPromptContext);
  // Safe fallback rather than throwing — a consumer rendered outside the
  // provider (a stray test, a future page) should just see "no install path"
  // and render nothing, not crash the page.
  return (
    ctx ?? {
      platform: null,
      standalone: false,
      install: async () => "unavailable",
    }
  );
}
