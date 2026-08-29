/**
 * UX review log #21 — tactile feedback for three trigger points only: an
 * RSVP tap, submitting a vote, and the Jio-resolved moment. Short pulses
 * (~12ms) for the first two, a slightly longer one (~20ms) on resolve —
 * long enough to feel deliberate, short enough to stay a nudge rather than
 * a buzz.
 *
 * A single global on/off toggle (`isHapticsEnabled`/`setHapticsEnabled`,
 * localStorage-backed — this is a per-device preference, not something any
 * server logic ever reads) works the same everywhere. iOS Safari has never
 * implemented `navigator.vibrate` — a permanent platform limit, not a bug
 * here — so turning the toggle off on iOS has nothing to actually disable;
 * no platform-specific UI is needed for that, the toggle just silently does
 * nothing there either way.
 */

const STORAGE_KEY = "jio:haptics-enabled";

export function isHapticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Private browsing or storage disabled — the toggle just won't persist.
  }
}

function fire(pattern: number | number[]) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  if (!isHapticsEnabled()) return;
  navigator.vibrate(pattern);
}

/** RSVP tap, or submitting a vote — a short, light pulse. */
export function hapticTap(): void {
  fire(12);
}

/** The Jio-resolved moment — a touch longer, since it's the bigger beat. */
export function hapticResolve(): void {
  fire(20);
}
