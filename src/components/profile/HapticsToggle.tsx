"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { hapticTap, isHapticsEnabled, setHapticsEnabled } from "@/lib/haptics";

/**
 * UX review log #21 — the one on/off switch for haptic feedback (RSVP tap,
 * vote submit, Jio-resolved). A single global toggle works the same
 * everywhere; iOS Safari has never implemented `navigator.vibrate`, so
 * turning it off there has nothing to actually disable — no separate
 * platform-specific copy or UI for that, it's just quietly a no-op.
 */
export default function HapticsToggle() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(isHapticsEnabled());
  }, []);

  const toggle = () => {
    const next = !enabled;
    setHapticsEnabled(next);
    setEnabled(next);
    if (next) hapticTap();
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-ink text-sm font-medium">Haptics</p>
        <p className="text-stone text-xs">
          A short buzz on an RSVP, a vote, or a Jio being decided.
        </p>
      </div>
      <Button size="sm" variant={enabled ? "secondary" : "primary"} onClick={toggle}>
        {enabled ? "Turn off" : "Turn on"}
      </Button>
    </div>
  );
}
