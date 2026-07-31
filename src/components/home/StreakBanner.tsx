"use client";

import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { formatCuisine } from "@/lib/utils";
import type { CuisineStreak } from "@/types";

/**
 * "Three days of Japanese — break the streak?"
 *
 * A nudge, not a scold. People fall into ruts without noticing, and the whole
 * point of the app is to widen the rotation. Only shows from three days, so it
 * does not nag about having eaten the same thing twice.
 */
export default function StreakBanner() {
  const { data } = useSWR<{ streak: CuisineStreak | null }>(
    "/api/metrics",
    fetcher
  );

  const streak = data?.streak;
  if (!streak || streak.days < 3) return null;

  return (
    <div className="border-ember-tint bg-ember-tint/30 flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
      <p className="text-ink text-sm">
        <span className="font-medium">
          {streak.days} days of {formatCuisine(streak.cuisine)}
        </span>
        <span className="text-stone"> in a row.</span>
      </p>
      <Link
        href={`/suggest?exclude=${streak.cuisine}`}
        className="text-ember shrink-0 text-sm font-medium underline"
      >
        Break it
      </Link>
    </div>
  );
}
