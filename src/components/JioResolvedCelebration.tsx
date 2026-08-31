"use client";

import { useEffect, type CSSProperties } from "react";
import JioMark from "@/components/brand/JioMark";
import { Button } from "@/components/ui";

/**
 * The three Ember pebble paths, copied verbatim from JioMark.tsx's own
 * `<g fill="var(--color-ember, ...)">` group — kept in sync by hand since
 * that file's own doc comment calls its geometry traced artwork, not
 * something to reconstruct from rules. Rendered here as their own
 * elements (rather than stand-in circles) so the converge animation below
 * moves the actual pebble shape into place, landing exactly on top of
 * where JioMark itself draws the same path — a real earlier version used
 * plain circles that visibly swapped shape into a pebble the instant
 * JioMark faded in on top of them.
 */
const PEBBLE_PATHS = [
  "M46.184,30.510 C45.370,30.673 44.414,30.320 43.547,30.118 C42.679,29.917 41.837,29.570 40.981,29.301 C40.125,29.031 39.266,28.771 38.409,28.503 C37.553,28.234 36.698,27.961 35.842,27.690 C34.987,27.419 34.131,27.148 33.276,26.877 C32.420,26.605 31.559,26.348 30.709,26.062 C29.859,25.775 28.950,25.581 28.176,25.158 C27.403,24.734 26.633,24.183 26.067,23.519 C25.502,22.855 25.037,22.008 24.782,21.174 C24.526,20.339 24.433,19.376 24.533,18.510 C24.633,17.643 24.940,16.727 25.380,15.974 C25.821,15.221 26.504,14.571 27.178,13.991 C27.851,13.413 28.672,12.996 29.420,12.501 C30.169,12.006 30.884,11.443 31.670,11.021 C32.456,10.600 33.278,10.163 34.135,9.974 C34.993,9.785 35.945,9.762 36.815,9.887 C37.685,10.012 38.592,10.298 39.357,10.727 C40.121,11.155 40.830,11.786 41.403,12.457 C41.976,13.129 42.344,13.983 42.797,14.757 C43.250,15.531 43.679,16.320 44.121,17.101 C44.563,17.882 45.007,18.663 45.452,19.442 C45.898,20.221 46.346,20.998 46.792,21.777 C47.239,22.556 47.743,23.312 48.129,24.114 C48.515,24.918 49.059,25.756 49.109,26.594 C49.159,27.431 48.919,28.487 48.431,29.139 C47.944,29.792 46.998,30.347 46.184,30.510 Z",
  "M34.861,55.645 C34.012,55.671 33.036,55.444 32.296,55.033 C31.556,54.622 30.846,53.912 30.421,53.178 C29.997,52.444 29.737,51.476 29.749,50.628 C29.761,49.780 30.147,48.901 30.494,48.093 C30.841,47.286 31.385,46.553 31.833,45.784 C32.281,45.015 32.734,44.249 33.184,43.481 C33.633,42.713 34.081,41.944 34.530,41.176 C34.980,40.407 35.428,39.639 35.878,38.871 C36.328,38.103 36.728,37.298 37.230,36.569 C37.731,35.840 38.223,35.057 38.886,34.497 C39.548,33.936 40.381,33.486 41.205,33.206 C42.029,32.926 42.957,32.809 43.832,32.816 C44.707,32.824 45.626,32.969 46.454,33.250 C47.281,33.532 48.089,33.987 48.797,34.505 C49.507,35.023 50.164,35.669 50.708,36.360 C51.251,37.050 51.751,37.830 52.060,38.647 C52.367,39.463 52.546,40.386 52.555,41.258 C52.564,42.129 52.406,43.055 52.113,43.876 C51.821,44.697 51.357,45.512 50.799,46.183 C50.241,46.853 49.484,47.379 48.766,47.899 C48.049,48.418 47.251,48.832 46.493,49.298 C45.734,49.764 44.975,50.227 44.218,50.695 C43.460,51.163 42.708,51.638 41.950,52.104 C41.193,52.571 40.432,53.032 39.671,53.495 C38.912,53.958 38.192,54.524 37.390,54.882 C36.588,55.240 35.710,55.620 34.861,55.645 Z",
  "M23.608,50.103 C22.738,50.179 21.767,49.984 20.941,49.664 C20.114,49.344 19.403,48.693 18.650,48.182 C17.896,47.672 17.161,47.132 16.420,46.601 C15.680,46.071 14.884,45.597 14.206,44.999 C13.528,44.399 12.849,43.752 12.352,43.007 C11.855,42.262 11.462,41.394 11.223,40.530 C10.985,39.666 10.875,38.720 10.918,37.825 C10.962,36.931 11.188,36.014 11.483,35.161 C11.777,34.308 12.278,33.523 12.685,32.708 C13.092,31.893 13.508,31.082 13.923,30.271 C14.337,29.460 14.755,28.650 15.171,27.840 C15.588,27.029 15.965,26.192 16.422,25.409 C16.879,24.626 17.238,23.643 17.913,23.142 C18.586,22.642 19.662,22.301 20.466,22.405 C21.270,22.510 22.216,23.112 22.737,23.769 C23.259,24.425 23.353,25.471 23.594,26.345 C23.834,27.220 23.981,28.126 24.181,29.015 C24.380,29.905 24.563,30.798 24.788,31.680 C25.013,32.563 25.243,33.446 25.532,34.309 C25.821,35.171 26.189,36.008 26.523,36.855 C26.857,37.703 27.203,38.546 27.535,39.394 C27.867,40.243 28.300,41.071 28.514,41.946 C28.728,42.821 28.905,43.764 28.821,44.645 C28.737,45.526 28.454,46.472 28.010,47.232 C27.567,47.992 26.892,48.728 26.158,49.206 C25.425,49.684 24.477,50.027 23.608,50.103 Z",
];

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
 * The three real pebble shapes (not stand-in circles — see PEBBLE_PATHS
 * above) converge from scattered positions onto the exact spot JioMark's
 * own three pebbles sit at, then the real mark's centre dot
 * resolves in a lighter warm tan — a scoped, documented exception to
 * "colours are fixed, never recoloured independently" (JioMark.tsx's own
 * rule): true espresso-on-espresso is invisible against this backdrop, and
 * a lighter cream tested as too washed-out. Done via a local override of
 * the `--color-espresso` CSS variable on the wrapper around this one
 * `JioMark` usage (its centre-dot path reads `fill="var(--color-espresso,
 * ...)"`, so the override cascades straight to it) rather than a separate
 * stand-in disc drawn underneath — a stand-in disc sized to match the real
 * dot is always fully hidden by it once JioMark paints on top, and sized
 * bigger than the real dot it just leaves a visible ring around it. Nothing
 * in JioMark.tsx itself changes, and no other `JioMark` usage is affected —
 * the override is scoped to this component's own DOM subtree.
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
        <div
          className="relative mx-auto h-28 w-28"
          style={{ "--color-espresso": "#c9ab84" } as CSSProperties}
          aria-hidden="true"
        >
          {PEBBLE_PATHS.map((d, i) => (
            <svg
              key={i}
              viewBox="0 0 64 64"
              className={`animate-pebble-${i + 1} absolute inset-0 h-full w-full`}
            >
              <path d={d} fill="var(--color-ember, #c0392b)" />
            </svg>
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
