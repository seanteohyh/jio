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
        "border-dolch-border bg-dolch-surface/70 rounded-xl border p-4",
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
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-sm",
        variant === "primary" &&
          "bg-dolch-accent text-white hover:bg-orange-600",
        variant === "secondary" &&
          "border-dolch-border bg-dolch-bg text-dolch-text hover:bg-dolch-surface border",
        variant === "ghost" &&
          "text-dolch-muted hover:bg-dolch-surface hover:text-dolch-text",
        variant === "danger" &&
          "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
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
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
        variant === "primary" &&
          "bg-dolch-accent text-white hover:bg-orange-600",
        variant === "secondary" &&
          "border-dolch-border bg-dolch-bg text-dolch-text hover:bg-dolch-surface border",
        variant === "ghost" &&
          "text-dolch-muted hover:bg-dolch-surface hover:text-dolch-text",
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
  onClick,
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const Component = onClick ? "button" : "span";
  return (
    <Component
      onClick={onClick}
      type={onClick ? "button" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors",
        active
          ? "bg-dolch-accent text-white"
          : "border-dolch-border bg-dolch-bg text-dolch-muted border",
        onClick && !active && "hover:border-dolch-accent hover:text-dolch-text",
        className
      )}
    >
      {children}
    </Component>
  );
}

export function BudgetBadge({ tier }: { tier: number }) {
  const entry = BUDGET_TIERS.find((t) => t.tier === tier) ?? BUDGET_TIERS[1];
  return (
    <span
      className="text-dolch-muted font-mono text-xs"
      title={entry.description}
    >
      {entry.label}
    </span>
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
    return <span className="text-dolch-muted text-xs">Not rated yet</span>;
  }
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span
      className={cn(
        "text-dolch-warn inline-flex items-center gap-0.5",
        size === "sm" ? "text-xs" : "text-sm"
      )}
      aria-label={`${rating.toFixed(1)} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true">
          {rounded >= n ? "★" : rounded >= n - 0.5 ? "⯨" : "☆"}
        </span>
      ))}
      <span className="text-dolch-muted ml-1">{rating.toFixed(1)}</span>
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
    <div className="border-dolch-border rounded-xl border border-dashed px-6 py-10 text-center">
      <p className="text-dolch-text font-medium">{title}</p>
      {description && (
        <p className="text-dolch-muted mx-auto mt-1 max-w-sm text-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10" role="status">
      <span className="border-dolch-border border-t-dolch-accent h-5 w-5 animate-spin rounded-full border-2" />
      <span className="text-dolch-muted text-sm">{label}…</span>
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
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
      <h2 className="text-dolch-text text-base font-semibold">{children}</h2>
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
      <span className="text-dolch-text mb-1 block text-sm font-medium">
        {label}
      </span>
      {children}
      {hint && <span className="text-dolch-muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "border-dolch-border bg-dolch-bg text-dolch-text placeholder:text-dolch-muted w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-dolch-accent md:text-sm";
