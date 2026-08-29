import { BudgetIcon } from "@/components/icons";

/**
 * UX review log #24 — "typical spend" as its own small gauge, in budget's
 * existing sage tone (the same colour `BudgetBadge`/sage-tinted UI already
 * uses for budget elsewhere) rather than a plain stat tile.
 */
export default function BudgetGauge({
  tier,
  label,
}: {
  /** 1-6, same `BudgetTier` scale as everywhere else. */
  tier: number;
  label: string;
}) {
  const pct = Math.max(0, Math.min(1, tier / 6));

  return (
    <div className="flex items-center gap-3">
      <div className="bg-paper relative h-2 flex-1 overflow-hidden rounded-full">
        <div
          className="bg-sage h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className="text-sage flex shrink-0 items-center gap-1 text-sm font-semibold">
        <BudgetIcon className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}
