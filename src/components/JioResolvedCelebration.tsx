"use client";

import { useEffect } from "react";
import JioMark from "@/components/brand/JioMark";
import { Button } from "@/components/ui";

/**
 * The decided-Jio celebration — UX review log #25. Replaces the old plain
 * "Your first decided Jio!" card (which only ever fired once, ever, per
 * account) now that `qualifiesForDecidedCelebration` fires this for every
 * decided Jio a viewer RSVP'd and voted on, gated on its lunch still being
 * ahead of it.
 *
 * A full-screen splash, not an inline page card (a real user report: the
 * card version could land scrolled out of view below whatever the page's
 * scroll position happened to be after the vote that triggered it, so
 * nobody ever saw either the card or its own entry animation). A fixed
 * overlay is always exactly where the eye already is regardless of scroll
 * position, and the explicit "Continue" button is the one deliberate way
 * back to the Jio itself rather than a backdrop tap or auto-dismiss timer.
 *
 * Three loose pebbles converge from scattered positions onto the exact spot
 * JioMark's own three pebbles sit at, then the real mark fades in over them
 * so the resting state is the authentic brand mark rather than an
 * approximation staying on screen. The backdrop is a tan/coffee-toned disc
 * — a scoped, documented exception to "colours are fixed, never recoloured
 * independently" (JioMark.tsx's own rule): true espresso-on-espresso is
 * invisible against this backdrop, and a lighter cream tested as too
 * washed-out, so the centre disc drawn *underneath* the settling mark
 * (never JioMark.tsx itself, which stays untouched) uses a lighter warm tan
 * instead, purely for the duration this splash is on screen. Sized to match
 * JioMark's own centre-dot proportions almost exactly (a real earlier bug:
 * an arbitrarily bigger stand-in disc left two visibly different-sized
 * circles on screen once the real, much smaller dot faded in on top of it).
 */
export default function JioResolvedCelebration({
  placeName,
  onContinue,
}: {
  /** The winning place's name (or free-text label) — folded into the
   *  headline so this reads as "we decided on X," not a generic banner. */
  placeName: string;
  /** Dismisses the splash, back to the Jio's own page underneath. */
  onContinue: () => void;
}) {
  // Locks background scroll while the splash is up — this is a moment, not
  // another scrollable card in the page's own flow.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Jio decided"
    >
      <div
        className="animate-fade-in relative w-full max-w-sm overflow-hidden rounded-2xl p-8 text-center"
        style={{
          background:
            "radial-gradient(circle at 50% 38%, #5c4a3a 0%, #3d342c 55%, #2b241e 100%)",
        }}
      >
        <div className="relative mx-auto h-28 w-28" aria-hidden="true">
          {/* The recoloured stand-in disc — see the exception noted above.
              inset-[44%] matches JioMark's own centre-dot width almost
              exactly (measured directly off a rendered screenshot, not
              just the SVG path's bounding box — the two didn't quite agree)
              — anything bigger leaves a visible ring of tan around the real
              dot once it settles on top. */}
          <div
            className="animate-mark-settle absolute inset-[44%] rounded-full"
            style={{ background: "#c9ab84" }}
          />
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`animate-pebble-${n} bg-ember absolute inset-[38%] rounded-full`}
            />
          ))}
          <JioMark className="animate-mark-settle absolute inset-0 h-full w-full" />
        </div>

        {/* Deliberately not `.font-display` — that class's own global rule
            (globals.css) hard-codes espresso text, which silently beat
            `text-white` here and made this headline nearly invisible
            against an espresso-toned backdrop. Same font, applied inline
            instead, so the colour utility actually wins. */}
        <p
          className="relative mt-7 text-xl font-bold tracking-tight text-white"
          style={{
            fontFamily: "var(--font-bricolage), var(--font-geist-sans), sans-serif",
            letterSpacing: "-0.01em",
          }}
        >
          Decided!
        </p>
        <p className="relative mt-1 text-sm text-white/80">
          {placeName} — see you there.
        </p>

        <Button
          onClick={onContinue}
          variant="outlineInverse"
          className="relative mt-6"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
