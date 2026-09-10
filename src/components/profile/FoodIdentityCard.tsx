"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { ShareNodesIcon } from "@/components/icons";
import { ArchetypeIcon } from "@/components/ArchetypeIcon";
import ShareFoodIdentityCard from "@/components/ShareFoodIdentityCard";
import { formatMonthKey } from "@/lib/utils";
import { MIN_VISITS_FOR_ARCHETYPE, getArchetypeRuleTrace } from "@/lib/foodIdentity";
import type { UserFoodIdentitySnapshot, UserMetrics } from "@/types";

/** "Aug", not "August 2026" — the history strip's chips need to stay
 *  narrow side by side; the full month/year still shows in the card body
 *  above via `formatMonthKey`. */
function formatShortMonth(key: string): string {
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString("en-SG", { month: "short" });
}

/** A month's headline minus its leading "The " ("The Loyalist" -> "Loyalist")
 *  for the history chip, which only has room for a short label — falls back
 *  to the full headline when there's no such prefix ("Budget Hunter",
 *  "Just getting started"). */
function shortArchetypeLabel(headline: string): string {
  return headline.replace(/^The /, "");
}

/**
 * CHANGES_20260821_combined2.md Item 1 — headlines Profile's "Your numbers,"
 * above the plain stat tiles. `snapshot` is the latest locked monthly card;
 * `null` until the cron has run at least once for this account. Below
 * `MIN_VISITS_FOR_ARCHETYPE` visits, `totalVisits` drives a 0-visit teaser
 * instead (Log 5) so a brand-new account still sees the feature exists.
 *
 * `history` (Log 3) is the full past-months list, most recent first —
 * `history[0]` is the same entry as `snapshot`. Tapping a chip swaps which
 * entry the card body (and the Share button/card) renders; it never
 * changes which entry is "the" current one, so `snapshot` stays the prop
 * that reflects the account's actual latest month regardless of what's
 * being viewed.
 *
 * `metrics` (Log 4) feeds the tap-to-reveal "why" panel — the same live,
 * cumulative `UserMetrics` already fetched for the rest of the profile
 * page, not a per-month archive (snapshots only ever stored the resulting
 * archetype/headline/description, never the raw numbers behind them — see
 * `getArchetypeRuleTrace`'s own doc comment). Because of that, the panel
 * only makes sense — and only renders — while viewing the account's
 * current snapshot; it would misrepresent a past month if shown while
 * browsing an older Log 3 history chip, since `metrics` reflects today,
 * not that month.
 */
export default function FoodIdentityCard({
  snapshot,
  history,
  totalVisits,
  metrics,
}: {
  snapshot: UserFoodIdentitySnapshot | null;
  history: UserFoodIdentitySnapshot[];
  totalVisits: number;
  metrics: UserMetrics;
}) {
  const [sharing, setSharing] = useState(false);
  const [viewedMonth, setViewedMonth] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  if (!snapshot) {
    return (
      <Card className="border-ember/30 bg-ember-tint/40 space-y-2">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: "linear-gradient(155deg, #f1ece3, #e7e0d4)" }}
          >
            <ArchetypeIcon archetype="just_getting_started" size={20} />
          </div>
          <div>
            <p className="text-stone text-xs font-semibold tracking-wide uppercase">
              Your food identity
            </p>
            <p className="font-display text-ink text-lg font-bold">
              {totalVisits === 0
                ? "Not yet unlocked"
                : totalVisits < MIN_VISITS_FOR_ARCHETYPE
                  ? "Almost there"
                  : "Locking in soon"}
            </p>
          </div>
        </div>
        <p className="text-stone text-xs">
          {totalVisits === 0
            ? "Log your first meal to start building it — archetypes lock in once you've logged 3."
            : totalVisits < MIN_VISITS_FOR_ARCHETYPE
              ? `${totalVisits} of ${MIN_VISITS_FOR_ARCHETYPE} visits logged — ${MIN_VISITS_FOR_ARCHETYPE - totalVisits} more and your archetype locks in next month.`
              : "You've logged enough — this unlocks with next month's update."}
        </p>
      </Card>
    );
  }

  const viewed = history.find((h) => h.month === viewedMonth) ?? snapshot;

  return (
    <Card className="border-ember/30 bg-ember-tint/40 space-y-2">
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px]"
          style={{ background: "linear-gradient(155deg, #f2ded4, #ecd0c2)" }}
        >
          <ArchetypeIcon archetype={viewed.archetype} size={22} />
        </div>
        <div>
          <p className="text-stone text-xs font-semibold tracking-wide uppercase">
            Your food identity &middot; {formatMonthKey(viewed.month)}
          </p>
        </div>
      </div>
      <p className="font-display text-ink text-2xl font-bold tracking-tight">
        {viewed.headline}
      </p>
      <p className="text-stone text-sm">{viewed.description}</p>

      {viewed.month === snapshot.month && (
        <div>
          <button
            type="button"
            onClick={() => setShowWhy((prev) => !prev)}
            className="text-ember text-xs font-semibold underline"
          >
            {showWhy ? "Hide why" : "Why this archetype?"}
          </button>
          {showWhy && (
            <ul className="border-line mt-2 space-y-1 rounded-lg border bg-white p-3 text-xs">
              {getArchetypeRuleTrace(metrics).map((rule) => (
                <li
                  key={rule.label}
                  className={rule.matched ? "text-ink font-semibold" : "text-stone"}
                >
                  {rule.label}: {rule.actual} {rule.matched ? "≥" : "<"} {rule.threshold}
                  {rule.matched && " — matched"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {history.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {history.map((entry) => {
            const selected = entry.month === viewed.month;
            return (
              <button
                key={entry.month}
                type="button"
                onClick={() => setViewedMonth(entry.month)}
                className={
                  selected
                    ? "bg-ember rounded-full px-3 py-1 text-xs font-semibold text-white"
                    : "border-line text-stone rounded-full border px-3 py-1 text-xs font-semibold"
                }
              >
                {formatShortMonth(entry.month)} &middot; {shortArchetypeLabel(entry.headline)}
              </button>
            );
          })}
        </div>
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => setSharing((prev) => !prev)}
      >
        {!sharing && (
          <ShareNodesIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        )}
        {sharing ? "Hide share card" : "Share"}
      </Button>

      {sharing && (
        <ShareFoodIdentityCard
          eyebrow="YOUR FOOD IDENTITY"
          headline={viewed.headline}
          description={viewed.description}
          monthLabel={formatMonthKey(viewed.month)}
        />
      )}
    </Card>
  );
}
