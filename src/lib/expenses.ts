import { budgetLabel } from "./constants";
import type { BudgetTier, ExpenseCategory, ExpenseEntry, ExpenseMonthSummary } from "@/types";

/**
 * Shared math behind the personal expense ledger (migration 094) — kept
 * here, not duplicated inside demoRepo/supabaseRepo, so both compute a
 * month's summary identically.
 */

/** Cents -> "$12.50", the one place this ledger's amounts get formatted. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** "2026-08" -> the current calendar month key, in that same shape. */
export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-08" -> "2026-07"; rolls the year back at January. */
export function previousMonthKey(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-08" -> "2026-09"; rolls the year forward at December. Used as the
 *  exclusive upper bound for a `logged_at` range query against a live
 *  Postgres `date` column, where a plain string-prefix match (what the
 *  in-memory repo uses) isn't available. */
export function nextMonthKey(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Reverse of `BUDGET_TIERS`' own dollar bands (constants.ts), so an average
 * spend can be expressed in the same tier language `budgetLabel()` already
 * uses for a person's stated preference, rather than a bare dollar figure.
 */
export function centsToBudgetTier(cents: number): BudgetTier {
  const dollars = cents / 100;
  if (dollars < 8) return 1;
  if (dollars < 15) return 2;
  if (dollars < 30) return 3;
  if (dollars < 50) return 4;
  if (dollars < 100) return 5;
  return 6;
}

function emptyByCategory(): Record<ExpenseCategory, number> {
  return { lunch: 0, coffee: 0, snack: 0, other: 0 };
}

function budgetRangeLabel(min: BudgetTier, max: BudgetTier): string {
  return min === max ? budgetLabel(min) : `${budgetLabel(min)}–${budgetLabel(max)}`;
}

/**
 * `thisMonth`/`previousMonth` are already filtered to their respective
 * calendar months by the caller (a plain `logged_at` string-prefix match —
 * it's a bare `date` column, no timezone to resolve). `budgetPrefs` is
 * `null` when the viewer has never set one, in which case there's nothing
 * to compare against and `comparisonNote` stays `null`.
 */
export function buildExpenseMonthSummary(
  month: string,
  thisMonth: ExpenseEntry[],
  previousMonth: ExpenseEntry[],
  budgetPrefs: { budget_min: BudgetTier; budget_max: BudgetTier } | null
): ExpenseMonthSummary {
  const byCategory = emptyByCategory();
  let totalCents = 0;
  for (const entry of thisMonth) {
    byCategory[entry.category] += entry.amount_cents;
    totalCents += entry.amount_cents;
  }

  const previousTotalCents = previousMonth.reduce(
    (sum, entry) => sum + entry.amount_cents,
    0
  );
  const deltaVsPreviousMonthPct =
    previousTotalCents > 0
      ? Math.round(((totalCents - previousTotalCents) / previousTotalCents) * 100)
      : null;

  let comparisonNote: string | null = null;
  if (thisMonth.length > 0 && budgetPrefs) {
    const avgCents = totalCents / thisMonth.length;
    const avgTier = centsToBudgetTier(avgCents);
    const rangeLabel = budgetRangeLabel(budgetPrefs.budget_min, budgetPrefs.budget_max);
    if (avgTier > budgetPrefs.budget_max) {
      comparisonNote = `Averaging ${budgetLabel(avgTier)} per entry — above your usual ${rangeLabel} range.`;
    } else if (avgTier < budgetPrefs.budget_min) {
      comparisonNote = `Averaging ${budgetLabel(avgTier)} per entry — below your usual ${rangeLabel} range.`;
    } else {
      comparisonNote = `Averaging ${budgetLabel(avgTier)} per entry — right in your usual ${rangeLabel} range.`;
    }
  }

  return { month, totalCents, byCategory, deltaVsPreviousMonthPct, comparisonNote };
}
