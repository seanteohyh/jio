import JioMark from "./JioMark";

/**
 * Mark plus wordmark.
 *
 * The wordmark is lowercase `jio` in the display face — lowercase because the
 * word is an invitation, not an announcement. Clear space between mark and
 * word is roughly one centre-disc diameter, per the brand rules.
 */
export default function JioLockup({
  className,
  size = "md",
  beta = false,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Small "beta" tag next to the wordmark, in place of a fuller explanatory note. */
  beta?: boolean;
}) {
  const mark = { sm: "h-6 w-6", md: "h-8 w-8", lg: "h-10 w-10" }[size];
  const word = { sm: "text-xl", md: "text-2xl", lg: "text-3xl" }[size];

  return (
    <span
      className={`inline-flex items-center gap-2 ${className ?? ""}`}
      role="img"
      aria-label={beta ? "Jio, beta" : "Jio"}
    >
      <JioMark className={`${mark} shrink-0`} />
      <span
        className={`font-display text-ink ${word} leading-none font-bold tracking-tight lowercase`}
      >
        jio
      </span>
      {beta && (
        <span
          aria-hidden="true"
          className="text-stone self-start text-[10px] font-semibold tracking-wide uppercase"
        >
          Beta
        </span>
      )}
    </span>
  );
}
