"use client";

import { useState } from "react";
import { Button } from "./ui";
import type { Place } from "@/types";

/**
 * The tie-breaker of last resort.
 *
 * Sometimes a group genuinely cannot decide and what they want is not a better
 * algorithm but permission to stop deciding. The wheel provides that: it is
 * visibly random, so nobody has to defend the outcome.
 *
 * Respects prefers-reduced-motion via the global CSS rule — the spin collapses
 * to an instant result rather than being removed.
 */
export default function RouletteWheel({
  places,
  onResult,
  disabled,
}: {
  places: Place[];
  onResult: (place: Place) => void;
  disabled?: boolean;
}) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState<Place | null>(null);

  const segmentAngle = places.length > 0 ? 360 / places.length : 360;

  const spin = () => {
    if (spinning || places.length === 0) return;

    setSpinning(true);
    setWinner(null);

    const index = Math.floor(Math.random() * places.length);
    // Land the chosen segment's centre under the pointer at the top, after a
    // few full turns so it reads as a spin rather than a jump.
    const target =
      360 * 4 + (360 - (index * segmentAngle + segmentAngle / 2));

    setRotation((prev) => prev + target);

    window.setTimeout(() => {
      setSpinning(false);
      setWinner(places[index]);
      onResult(places[index]);
    }, 3200);
  };

  if (places.length === 0) return null;

  const colors = [
    "#b4532f",
    "#567b57",
    "#a87b2d",
    "#6b6091",
    "#3f6b78",
    "#8c4a52",
    "#427a70",
    "#9c4728",
  ];

  // Build the wheel as a conic gradient — no canvas, no SVG arc maths.
  const gradient = places
    .map((_, index) => {
      const color = colors[index % colors.length];
      const start = index * segmentAngle;
      const end = (index + 1) * segmentAngle;
      return `${color} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        {/* Pointer */}
        <div
          className="absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1"
          aria-hidden="true"
        >
          <div className="h-0 w-0 border-x-8 border-t-[14px] border-x-transparent border-t-[#2b2b2b]" />
        </div>

        <div
          className="border-line h-56 w-56 rounded-full border-4 shadow-inner"
          style={{
            background: `conic-gradient(${gradient})`,
            transform: `rotate(${rotation}deg)`,
            transition: spinning
              ? "transform 3.2s cubic-bezier(0.17, 0.67, 0.15, 1)"
              : "none",
          }}
          role="img"
          aria-label={`Roulette wheel with ${places.length} options`}
        />

        <div className="bg-paper border-line absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-center text-[10px] leading-tight font-medium">
          {spinning ? "…" : winner ? "🎉" : "Spin"}
        </div>
      </div>

      <ol className="text-stone grid w-full grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {places.map((place, index) => (
          <li key={place.id} className="flex items-center gap-1.5 truncate">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: colors[index % colors.length] }}
              aria-hidden="true"
            />
            <span className="truncate">{place.name}</span>
          </li>
        ))}
      </ol>

      <Button onClick={spin} disabled={spinning || disabled}>
        {spinning ? "Spinning…" : winner ? "Spin again" : "Spin the wheel"}
      </Button>

      {winner && !spinning && (
        <p aria-live="polite" className="text-ink text-sm font-medium">
          {winner.name}
        </p>
      )}
    </div>
  );
}
