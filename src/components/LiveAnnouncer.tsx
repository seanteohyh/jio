"use client";

import { createContext, useCallback, useContext, useState } from "react";

/**
 * UX review log #4 — "one persistent, empty aria-live region per page."
 *
 * A live region only reliably gets announced by a screen reader when its
 * *content changes* after it's already mounted — conditionally rendering a
 * fresh `aria-live` element each time a milestone happens is unreliable, so
 * every announcement in the app funnels through this one shared, always-
 * mounted region instead (provided once, at the layout root).
 *
 * Milestones only, not every change: the Jio resolving (#25's generalized
 * celebration trigger) and a Flexi date's "leading" option changing. Plain
 * text always — a visual celebration can carry an emoji, but a screen
 * reader often speaks an emoji's name aloud, which reads oddly for this.
 */
const AnnounceContext = createContext<(text: string) => void>(() => {});

export function LiveAnnouncerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [message, setMessage] = useState("");

  const announce = useCallback((text: string) => {
    // Clearing first forces a real text change even when the same
    // milestone text was just announced a moment ago — a live region only
    // fires on a change, not on setting identical content again.
    setMessage("");
    window.setTimeout(() => setMessage(text), 50);
  }, []);

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div aria-live="polite" role="status" className="sr-only">
        {message}
      </div>
    </AnnounceContext.Provider>
  );
}

export function useAnnounce() {
  return useContext(AnnounceContext);
}
