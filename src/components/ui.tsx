"use client";

import Link from "next/link";
import { cn, avatarColor, initials } from "@/lib/utils";
import { BUDGET_TIERS } from "@/lib/constants";

/**
 * The small shared pieces. Kept in one file because each is a handful of lines
 * and hunting through fifteen one-component files is worse than scrolling.
 */

export function Card({
  children,
  className,
  as: Component = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return (
    <Component
      className={cn(
        "border-line bg-cream rounded-2xl border p-4 shadow-[var(--shadow-sm)]",
        className
      )}
    >
      {children}
    </Component>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      className={cn(
        // UX review log #21 — press feedback: a shared scale-down plus
        // colour shift on `:active`, the same primitive across every
        // button-shaped control in the app rather than one-off per surface.
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[color,background-color,transform] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        // 44px minimum touch target, per the accessibility rule in the brief.
        size === "sm" ? "min-h-9 px-3 py-1.5 text-sm" : "min-h-11 px-4 py-2.5 text-sm",
        variant === "primary" &&
          "bg-ember hover:bg-ember-deep active:bg-ember-deep text-white shadow-[var(--shadow-sm)]",
        variant === "secondary" &&
          "border-line bg-paper text-ink hover:bg-cream active:bg-cream border",
        variant === "ghost" &&
          "text-stone hover:bg-cream active:bg-cream hover:text-ink",
        variant === "danger" &&
          "border-ember-tint bg-ember-tint text-ember-tint-text hover:bg-ember-tint/70 active:bg-ember-tint/70 border",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
  target,
  rel,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  className?: string;
  /** For an external link (e.g. `target="_blank"`) — `next/link` forwards
   *  these straight onto the underlying `<a>`. */
  target?: string;
  rel?: string;
}) {
  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      className={cn(
        // UX review log #21 — same press-feedback primitive as Button.
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[color,background-color,transform] duration-150 active:scale-[0.97]",
        size === "sm" ? "min-h-9 px-3 py-1.5 text-sm" : "min-h-11 px-4 py-2.5 text-sm",
        variant === "primary" &&
          "bg-ember hover:bg-ember-deep active:bg-ember-deep text-white shadow-[var(--shadow-sm)]",
        variant === "secondary" &&
          "border-line bg-paper text-ink hover:bg-cream active:bg-cream border",
        variant === "ghost" &&
          "text-stone hover:bg-cream active:bg-cream hover:text-ink",
        className
      )}
    >
      {children}
    </Link>
  );
}

export function Chip({
  children,
  active,
  tone,
  onClick,
  className,
  ariaLabel,
  pressed,
}: {
  children: React.ReactNode;
  active?: boolean;
  /** Overrides the active-state color — the profile page's 3-state cuisine
   *  chips (CHANGES_20260816.md §3) use this to tell "like" from "dislike";
   *  a plain highlight can't. Omitted everywhere else, unchanged ember/white. */
  tone?: "like" | "dislike";
  onClick?: () => void;
  className?: string;
  /**
   * UX review log #3 — overrides the accessible name entirely. For a
   * remove-chip ("Remove {name}") or a 3-state taste-preference chip,
   * which states its value directly ("Chinese, disliked") since
   * `aria-pressed` only fits a genuine two-state toggle.
   */
  ariaLabel?: string;
  /**
   * UX review log #3 — only for a genuine two-state toggle (the cuisine
   * filter, "Kaki favourites only"). Omit for remove-chips and the 3-state
   * taste-preference chips — neither is a plain on/off toggle.
   */
  pressed?: boolean;
}) {
  const Component = onClick ? "button" : "span";
  return (
    <Component
      onClick={onClick}
      type={onClick ? "button" : undefined}
      aria-label={ariaLabel}
      aria-pressed={onClick ? pressed : undefined}
      className={cn(
        // UX review log #2 — a real 44px tap target, not an invisible
        // expanded hit-area: py-3.5 (14px top+bottom) plus text-xs's 16px
        // line-height is exactly 44px. `py-2.5` (the report's own literal
        // fix) only reaches ~36px — computed height, not the named class,
        // is what actually matters here.
        // UX review log #21 — same press-feedback primitive as Button;
        // only meaningful when the chip is actually clickable.
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-3.5 text-xs transition-[color,background-color,transform] duration-150",
        onClick && "active:scale-[0.97]",
        active && tone === "like" && "bg-sage-tint text-sage-tint-text",
        active && tone === "dislike" && "bg-ember-tint text-ember-tint-text",
        active && !tone && "bg-ember text-white",
        !active && "border-line bg-paper text-stone border",
        onClick && !active && "hover:border-ember hover:text-ink",
        className
      )}
    >
      {children}
    </Component>
  );
}

/**
 * Tinted metadata pill.
 *
 * Cuisine, budget and walk-time each get a light fill and a deeper text from
 * the same hue, which is what keeps them legible at 11-13px — a mid-tone
 * chip with white text fails AA at this size, and grey-on-grey reads as
 * disabled. Walk-time is the one place a cool tone is allowed, and only
 * because it is wayfinding rather than brand.
 */
export function TintPill({
  tone,
  children,
  title,
  className,
}: {
  tone: "cuisine" | "budget" | "walk" | "delight";
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  const tones = {
    cuisine: "bg-ember-tint text-ember-tint-text",
    budget: "bg-sage-tint text-sage-tint-text",
    walk: "bg-slate-tint text-slate-tint-text",
    delight: "bg-amber-tint text-amber-tint-text",
  } as const;

  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function BudgetBadge({ tier }: { tier: number }) {
  const entry = BUDGET_TIERS.find((t) => t.tier === tier) ?? BUDGET_TIERS[1];
  return (
    <TintPill tone="budget" title={entry.description}>
      <span className="font-mono">{entry.label}</span>
    </TintPill>
  );
}

export function Stars({
  rating,
  size = "sm",
}: {
  rating: number | null | undefined;
  size?: "sm" | "md";
}) {
  if (typeof rating !== "number") {
    return <span className="text-stone text-xs">Not rated yet</span>;
  }
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span
      className={cn(
        "text-amber inline-flex items-center gap-0.5",
        size === "sm" ? "text-xs" : "text-sm"
      )}
      aria-label={`${rating.toFixed(1)} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true">
          {rounded >= n ? "★" : rounded >= n - 0.5 ? "⯨" : "☆"}
        </span>
      ))}
      <span className="text-stone ml-1">{rating.toFixed(1)}</span>
    </span>
  );
}

export function Avatar({
  name,
  id,
  size = 28,
}: {
  name: string;
  id: string;
  size?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{
        backgroundColor: avatarColor(id),
        width: size,
        height: size,
        fontSize: size * 0.38,
      }}
      title={name}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-line rounded-xl border border-dashed px-6 py-10 text-center">
      <p className="text-ink font-medium">{title}</p>
      {description && (
        <p className="text-stone mx-auto mt-1 max-w-sm text-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * For an action in progress — a save, a submit. Reaching for this to cover
 * content that's still loading is the thing §9 of the design brief asks not
 * to do; use `Skeleton`/`SkeletonRows` for that instead, sized like the
 * content that's coming so the page doesn't jump when it arrives.
 */
export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10" role="status">
      <span className="border-line border-t-ember h-5 w-5 animate-spin rounded-full border-2" />
      <span className="text-stone text-sm">{label}…</span>
    </div>
  );
}

/** One shimmering placeholder block. Size it with className (h-4 w-32, etc). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

/** A stack of card-sized placeholder rows, for a list that's still loading. */
export function SkeletonRows({
  count = 4,
  className,
  rowClassName = "h-16 w-full",
}: {
  count?: number;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <div
      className={cn("space-y-2", className)}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={rowClassName} />
      ))}
    </div>
  );
}

/** A title-plus-body placeholder, for a single record that's still loading. */
export function SkeletonDetail() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="border-ember-tint bg-ember-tint text-ember-tint-text rounded-xl border px-3 py-2 text-sm"
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-ink text-base font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-ink mb-1 block text-sm font-medium">
        {label}
      </span>
      {children}
      {hint && <span className="text-stone mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "border-line bg-frost text-ink placeholder:text-stone focus:border-ember focus:ring-ember/25 min-h-11 w-full rounded-xl border px-3 py-2 text-base outline-none focus:ring-2 md:text-sm";
