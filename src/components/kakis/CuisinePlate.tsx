import {
  BakeryIcon,
  KopiIcon,
  MushroomIcon,
  NoodleBowlIcon,
  ShieldIcon,
  WokIcon,
} from "@/components/icons";
import { formatCuisine } from "@/lib/utils";

/**
 * UX review log #24 — the group's cuisine share, restyled as a plate: top
 * 3 cuisines plus "Others," each wedge labelled with a food icon (#20's
 * grouping) instead of a colour-key legend. Wedges rank by intensity
 * within one ember hue — explicitly not a per-cuisine colour system, which
 * stays out of scope for this page alone (the rest of the app still treats
 * cuisine tags the same way it does today).
 */
export function iconFor(slug: string) {
  if (slug === "halal") return ShieldIcon;
  if (["malay", "indian"].includes(slug)) return WokIcon;
  if (["western", "italian", "dessert", "fast_food"].includes(slug)) return BakeryIcon;
  if (["cafe", "modern"].includes(slug)) return KopiIcon;
  if (slug === "vegetarian") return MushroomIcon;
  // chinese, japanese, korean, thai, vietnamese, local, food_court,
  // traditional, and anything else not yet in the seed list.
  return NoodleBowlIcon;
}

const WEDGE_TONES = ["#c0392b", "#c0392bb3", "#c0392b80"];
const OTHERS_TONE = "#ece5d8";

export default function CuisinePlate({
  breakdown,
}: {
  breakdown: Record<string, number>;
}) {
  const sorted = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  const top3 = sorted.slice(0, 3);
  const othersShare = Math.max(
    0,
    1 - top3.reduce((sum, [, share]) => sum + share, 0)
  );

  const segments = [
    ...top3.map(([slug, share], i) => ({
      slug,
      share,
      color: WEDGE_TONES[i],
    })),
    ...(othersShare > 0.001
      ? [{ slug: null, share: othersShare, color: OTHERS_TONE }]
      : []),
  ];

  let cursor = 0;
  const stops = segments
    .map((seg) => {
      const from = cursor * 360;
      cursor += seg.share;
      const to = cursor * 360;
      return `${seg.color} ${from}deg ${to}deg`;
    })
    .join(", ");

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative h-24 w-24 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
        aria-hidden="true"
      >
        <div className="bg-cream absolute inset-3 rounded-full" />
      </div>
      <ul className="flex-1 space-y-1.5">
        {segments.map((seg) => {
          const Icon = seg.slug ? iconFor(seg.slug) : null;
          return (
            <li
              key={seg.slug ?? "others"}
              className="flex items-center gap-2 text-xs"
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: seg.color, color: "#fff" }}
              >
                {Icon ? (
                  <Icon className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true" className="text-[10px]">
                    ⋯
                  </span>
                )}
              </span>
              <span className="text-ink flex-1 truncate">
                {seg.slug ? formatCuisine(seg.slug) : "Others"}
              </span>
              <span className="text-stone shrink-0 tabular-nums">
                {Math.round(seg.share * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
