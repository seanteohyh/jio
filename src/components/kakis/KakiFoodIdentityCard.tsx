"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { ShareNodesIcon } from "@/components/icons";
import { AwardIcon, type AwardKind } from "@/components/AwardIcon";
import ShareFoodIdentityCard from "@/components/ShareFoodIdentityCard";
import { formatCuisine, formatMonthKey } from "@/lib/utils";
import type { KakiFoodIdentitySnapshot, KakiMetrics } from "@/types";
import type { CrownedAward } from "@/lib/kakiCrown";

/**
 * UX review log #24 — one new narrated sentence, built only from fields the
 * app already computes: the top cuisine and its share, and the top
 * favourite place's visit count and rating. No new data invented.
 */
export function narrateVibe(metrics: KakiMetrics): string | null {
  const [topCuisine, topShare] =
    Object.entries(metrics.groupCuisineBreakdown).sort((a, b) => b[1] - a[1])[0] ?? [];
  const topFav = metrics.groupFavouritePlaces[0];

  if (topCuisine && topFav) {
    return `${Math.round(topShare * 100)}% ${formatCuisine(topCuisine)}, and everyone keeps coming back to ${topFav.place_name} — ${topFav.visit_count} visit${topFav.visit_count === 1 ? "" : "s"} at ${topFav.avg_rating.toFixed(1)}★.`;
  }
  if (topCuisine) {
    return `${Math.round(topShare * 100)}% ${formatCuisine(topCuisine)} — this group knows what it likes.`;
  }
  if (topFav) {
    return `Everyone keeps coming back to ${topFav.place_name} — ${topFav.visit_count} visit${topFav.visit_count === 1 ? "" : "s"} at ${topFav.avg_rating.toFixed(1)}★.`;
  }
  return null;
}

interface RankedRow {
  user_id: string;
  sub: string;
}

interface AwardDisplay {
  kind: AwardKind;
  label: string;
  crownedUserId: string;
  sub: string;
  streak: number;
  passedNote: { leaderUserId: string; leaderValue: number; homeKakiName: string } | null;
  ranking: RankedRow[];
  formatSub: (value: number) => string;
}

/**
 * Log 6 — folds the crown rule (Part B) and the full-ranking expand (Part
 * A) into one shape per award slot. `crown` is the server-resolved winner
 * for this month (possibly a runner-up who inherited the crown — see
 * `resolveKakiAwardCrown`'s own doc comment); `ranking` is this kaki's live
 * full leaderboard for the tap-to-expand list, independent of whichever
 * month's snapshot is locked in (same "live metrics alongside a locked
 * snapshot" split `narrateVibe` above already uses on this same card).
 */
function buildAward(
  kind: AwardKind,
  label: string,
  crown: CrownedAward | null,
  ranking: RankedRow[],
  formatSub: (value: number) => string
): AwardDisplay | null {
  if (!crown) return null;
  return {
    kind,
    label,
    crownedUserId: crown.user_id,
    sub: formatSub(crown.value),
    streak: crown.streak,
    passedNote: crown.passedNote,
    ranking,
    formatSub,
  };
}

/**
 * CHANGES_20260821_combined2.md Item 1 — replaces the "Most active" and
 * "Adventurer" stat tiles that used to sit in `KakiMetricsCharts`'s grid:
 * same two award slots (now three, with Trailblazer), elevated into named
 * celebratory rows on a card of their own rather than left as plain
 * numbers. Positive-only by design, matching the doc — there is no
 * negative-framed slot at this level. `snapshot` is `null` until the cron
 * has run at least once for this group.
 *
 * `crowns` (Log 6 Part B) is who's actually shown as crowned in each award
 * slot this month, after the home-kaki rule — resolved server-side in
 * `/api/kakis/[id]`, since it needs cross-group data this component has no
 * way to fetch itself. Tapping a row expands it into the full per-member
 * ranking (Part A), independent of the crown decision.
 */
export default function KakiFoodIdentityCard({
  snapshot,
  nameFor,
  metrics,
  crowns,
}: {
  snapshot: KakiFoodIdentitySnapshot | null;
  nameFor: (userId: string) => string;
  metrics: KakiMetrics;
  crowns: {
    mostActive: CrownedAward | null;
    adventurer: CrownedAward | null;
    trailblazer: CrownedAward | null;
  };
}) {
  const vibeSentence = narrateVibe(metrics);
  const [sharing, setSharing] = useState(false);
  const [expandedKind, setExpandedKind] = useState<AwardKind | null>(null);

  if (!snapshot) {
    return (
      <Card className="border-ember/30 bg-ember-tint/40">
        <p className="text-ink text-sm font-medium">This group's vibe</p>
        <p className="text-stone mt-1 text-xs">
          Locks in early next month, once the group's logged a few visits.
        </p>
      </Card>
    );
  }

  const awards = [
    buildAward(
      "most_active",
      "Most active",
      crowns.mostActive,
      metrics.activeRanking.map((r) => ({
        user_id: r.user_id,
        sub: `${r.visits} visit${r.visits === 1 ? "" : "s"}`,
      })),
      (value) => `${value} visit${value === 1 ? "" : "s"}`
    ),
    buildAward(
      "adventurer",
      "Adventurer",
      crowns.adventurer,
      metrics.adventurerRanking.map((r) => ({
        user_id: r.user_id,
        sub: `${r.distinctPlaces} different place${r.distinctPlaces === 1 ? "" : "s"}`,
      })),
      (value) => `${value} different place${value === 1 ? "" : "s"}`
    ),
    buildAward(
      "trailblazer",
      "Trailblazer",
      crowns.trailblazer,
      metrics.trailblazerRanking.map((r) => ({
        user_id: r.user_id,
        sub: `${r.uniquePlaces} place${r.uniquePlaces === 1 ? "" : "s"} nobody else has been`,
      })),
      (value) => `${value} place${value === 1 ? "" : "s"} nobody else has been`
    ),
  ].filter((a): a is AwardDisplay => Boolean(a));

  // Only the awards themselves go into the shareable card — the crown's
  // own streak/passed-over context is a live-page-only nuance, same as the
  // tap-to-expand ranking below it.
  const shareAwards = awards.map((award) => ({
    label: award.label,
    value: nameFor(award.crownedUserId),
    sub: award.sub,
  }));

  return (
    <Card className="border-ember/30 bg-ember-tint/40 space-y-2">
      <p className="text-stone text-xs font-semibold tracking-wide uppercase">
        This group's vibe · {formatMonthKey(snapshot.month)}
      </p>
      <p className="font-display text-ink text-2xl font-bold tracking-tight">
        {snapshot.headline}
      </p>
      <p className="text-stone text-sm">{snapshot.description}</p>
      {vibeSentence && <p className="text-ink text-sm">{vibeSentence}</p>}

      {awards.length > 0 && (
        <div className="border-line grid grid-cols-2 gap-3 border-t pt-3">
          {awards.map((award) => {
            const expanded = expandedKind === award.kind;
            return (
              <div key={award.label} className="col-span-1">
                <button
                  type="button"
                  onClick={() => setExpandedKind(expanded ? null : award.kind)}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-white">
                    <AwardIcon kind={award.kind} size={16} />
                  </div>
                  <div>
                    <p className="text-stone text-[11px] font-semibold tracking-wide uppercase">
                      {award.label}
                      {award.streak >= 2 && (
                        <span className="text-ember ml-1">
                          🔥 {award.streak}-kaki streak
                        </span>
                      )}
                    </p>
                    <p className="text-ink text-sm font-semibold">
                      {nameFor(award.crownedUserId)}
                    </p>
                    <p className="text-stone text-xs">{award.sub}</p>
                    {award.passedNote && (
                      <p className="text-stone mt-0.5 text-xs italic">
                        {nameFor(award.passedNote.leaderUserId)}&rsquo;s leading here too
                        {" "}({award.formatSub(award.passedNote.leaderValue)})
                        {" "}— crowned in {award.passedNote.homeKakiName}.
                      </p>
                    )}
                  </div>
                </button>

                {expanded && (
                  <ol className="border-line mt-2 ml-10 space-y-1 border-l pl-3 text-xs">
                    {award.ranking.map((row, i) => (
                      <li key={row.user_id} className="text-stone">
                        <span className="text-ink font-medium">
                          {i + 1}. {nameFor(row.user_id)}
                        </span>{" "}
                        — {row.sub}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
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
          eyebrow="THIS GROUP'S VIBE"
          headline={snapshot.headline}
          description={snapshot.description}
          monthLabel={formatMonthKey(snapshot.month)}
          awards={shareAwards}
        />
      )}
    </Card>
  );
}
