import JioMark from "@/components/brand/JioMark";

/**
 * The decided-Jio celebration — UX review log #25. Replaces the old plain
 * "Your first decided Jio!" card (which only ever fired once, ever, per
 * account) now that `qualifiesForDecidedCelebration` fires this for every
 * decided Jio a viewer RSVP'd and voted on, gated on its lunch still being
 * ahead of it.
 *
 * Three loose pebbles converge from scattered positions onto the exact spot
 * JioMark's own three pebbles sit at, then the real mark fades in over them
 * so the resting state is the authentic brand mark rather than an
 * approximation staying on screen. The backdrop is a tan/coffee-toned disc
 * and ring — a scoped, documented exception to "colours are fixed, never
 * recoloured independently" (JioMark.tsx's own rule): true espresso-on-
 * espresso is invisible against this backdrop, and a lighter cream tested
 * as too washed-out, so the center disc drawn *underneath* the settling
 * mark (never JioMark.tsx itself, which stays untouched) uses a lighter
 * warm tan instead, purely for the duration this card is on screen.
 */
export default function JioResolvedCelebration({
  placeName,
}: {
  /** The winning place's name (or free-text label) — folded into the
   *  headline so this reads as "we decided on X," not a generic banner. */
  placeName: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-8 text-center"
      style={{
        background:
          "radial-gradient(circle at 50% 38%, #5c4a3a 0%, #3d342c 55%, #2b241e 100%)",
      }}
    >
      {/* The ring — a faint halo around the disc, echoing "teammates
          gathering" without literally drawing a second mark. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center"
      >
        <div
          className="h-40 w-40 rounded-full"
          style={{ boxShadow: "0 0 0 1px rgba(245, 233, 216, 0.12)" }}
        />
      </div>

      <div className="relative mx-auto h-28 w-28" aria-hidden="true">
        {/* The recoloured stand-in disc — see the exception noted above. */}
        <div
          className="animate-mark-settle absolute inset-[30%] rounded-full"
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

      <p className="font-display relative mt-7 text-xl font-bold tracking-tight text-white">
        Decided!
      </p>
      <p className="relative mt-1 text-sm text-white/80">
        {placeName} — see you there.
      </p>
    </div>
  );
}
