import { computeFingerprint, FINGERPRINT_DOT } from "@/lib/placeFingerprint";

/**
 * The generative per-place identicon (see `lib/placeFingerprint.ts`),
 * rendered as its own small avatar-like swatch wherever a place is shown
 * with no photo of its own — every list row, every detail header. A plain
 * server-renderable component (no state, no effects): the pattern is pure
 * data derived from `name`, so it costs nothing to compute on the server.
 *
 * Unlike the shareable ticket's low-opacity *watermark* treatment (drawn
 * over other content, so it has to stay quiet), this is the primary visual
 * for the slot it occupies — full-strength tone on a soft tint of the same
 * hue, so it actually reads as "this place's colour" at a glance.
 */
export default function PlaceFingerprint({
  name,
  size = 40,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const { cells, tone } = computeFingerprint(name);
  const cols = cells.length;
  const cell = size / cols;
  const dot = cell * 0.22;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden="true"
    >
      <rect width={size} height={size} rx={size * 0.24} fill={tone} opacity={0.14} />
      {cells.map((colCells, col) =>
        colCells.map(
          (filled, row) =>
            filled && (
              <rect
                key={`${col}-${row}`}
                x={col * cell}
                y={row * cell}
                width={cell}
                height={cell}
                fill={tone}
              />
            )
        )
      )}
      <circle cx={size / 2} cy={size / 2} r={dot} fill={FINGERPRINT_DOT} />
    </svg>
  );
}
