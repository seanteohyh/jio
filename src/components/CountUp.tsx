"use client";

import { useEffect, useRef, useState } from "react";

/**
 * UX review log #21 — streak counts, food-identity counts, and vote points
 * animate up to their final value over ~400-600ms instead of appearing
 * instantly. Respects `prefers-reduced-motion` itself (rather than relying
 * only on the app-wide animation-duration override) since this drives a
 * number via `requestAnimationFrame`, not a CSS animation.
 */
export default function CountUp({
  value,
  durationMs = 500,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prevValue = useRef(value);
  const frame = useRef<number>(0);

  useEffect(() => {
    const from = prevValue.current;
    const to = value;
    prevValue.current = value;
    if (from === to) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setDisplay(to);
      return;
    }

    const start = performance.now();
    cancelAnimationFrame(frame.current);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // Ease-out — fast start, settling in, rather than a linear ramp.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame.current);
  }, [value, durationMs]);

  return <span className={className}>{display}</span>;
}
