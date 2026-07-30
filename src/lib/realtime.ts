"use client";

import { createAuthBrowserClient } from "./supabase/browser";
import { isDemoMode } from "./utils";

/**
 * Live event updates.
 *
 * A lunch vote is a shared, short-lived thing — someone adds an option, three
 * people vote in the next two minutes. Making everyone refresh to see that is
 * the difference between the app feeling alive and feeling like a form.
 *
 * Returns an unsubscribe function in every case, including the ones where no
 * subscription was actually made, so callers never need a null check.
 */
export function subscribeToEventChanges(
  eventId: string,
  onChange: () => void
): () => void {
  if (isDemoMode()) return () => {};

  let cleanup = () => {};

  try {
    const client = createAuthBrowserClient();

    const channel = client
      .channel(`event-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_votes",
          filter: `event_id=eq.${eventId}`,
        },
        onChange
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_rsvps",
          filter: `event_id=eq.${eventId}`,
        },
        onChange
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_options",
          filter: `event_id=eq.${eventId}`,
        },
        onChange
      )
      .subscribe();

    cleanup = () => {
      client.removeChannel(channel);
    };
  } catch {
    // Realtime is an enhancement. If it cannot connect, polling and manual
    // refresh still work, and the page must not break.
  }

  return cleanup;
}
