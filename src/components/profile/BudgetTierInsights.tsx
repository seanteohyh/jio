import { Card, EmptyState, SectionHeading } from "@/components/ui";
import { budgetLabel, BUDGET_TIERS } from "@/lib/constants";
import type { UserMetrics } from "@/types";

/**
 * The generic, no-setup spending view — a budget-tier breakdown derived
 * entirely from places you've already visited (their own price tier, not a
 * real logged amount), so it works for anyone the moment they've logged a
 * few visits, no manual expense entry required. Shared between
 * `/profile/visits?view=spend` and `/profile/spending`'s own default
 * "Insights" tab — the latter surfaces this first, before the personal
 * dollar tracker, so someone who never wants to log real amounts still
 * gets real spending insight rather than an empty ledger on first open.
 */
export function emptyMetrics(): UserMetrics {
  return {
    totalVisits: 0,
    distinctPlaces: 0,
    favouritePlaces: [],
    avgRatingGiven: 0,
    cuisineBreakdown: {},
    avgBudgetTier: 0,
    avgBudgetLabel: "—",
    mostActiveMonth: null,
    currentVariety: 0,
    ratingHistogram: {},
    budgetBreakdown: {},
  };
}

export default function BudgetTierInsights({ metrics }: { metrics: UserMetrics }) {
  if (metrics.totalVisits === 0) {
    return (
      <EmptyState
        title="No visits yet"
        description="Log a few visits and your spend breakdown will show up here."
      />
    );
  }

  const total = Object.values(metrics.budgetBreakdown).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...Object.values(metrics.budgetBreakdown));
  const topTier = BUDGET_TIERS.slice().sort(
    (a, b) => (metrics.budgetBreakdown[b.tier] ?? 0) - (metrics.budgetBreakdown[a.tier] ?? 0)
  )[0];

  return (
    <div className="space-y-4">
      <p className="text-stone text-xs">
        Based on {metrics.currentVariety} place{metrics.currentVariety === 1 ? "" : "s"}{" "}
        you&apos;ve visited in the last 30 days — no logging needed.
      </p>

      <Card>
        <SectionHeading>By budget tier</SectionHeading>
        <ul className="space-y-2">
          {BUDGET_TIERS.map((t) => {
            const count = metrics.budgetBreakdown[t.tier] ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <li key={t.tier} className="flex items-center gap-3 text-xs">
                <span className="text-stone w-12 shrink-0">{t.label}</span>
                <span className="bg-paper h-3 flex-1 overflow-hidden rounded-full">
                  <span
                    className="bg-ember block h-full rounded-full"
                    style={{ width: `${Math.max(count > 0 ? 3 : 0, (count / max) * 100)}%` }}
                  />
                </span>
                <span className="text-stone w-10 shrink-0 text-right tabular-nums">
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {topTier && (metrics.budgetBreakdown[topTier.tier] ?? 0) > 0 && (
        <p className="text-stone text-xs">
          Most frequent tier: {budgetLabel(topTier.tier)} &middot; {topTier.description}
        </p>
      )}
    </div>
  );
}
