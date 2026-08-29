import { avatarColor, initials } from "@/lib/utils";

/**
 * UX review log #24 — an organic pebble silhouette rather than a plain
 * circle, matching the brand mark's own stated meaning ("teammates
 * gathering"). Scoped to the Kaki page's member list only — the shared
 * `Avatar` in ui.tsx (used everywhere else: reviews, invite pickers,
 * lobangs) is unaffected.
 */
export default function PebbleAvatar({
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
      className="inline-flex shrink-0 items-center justify-center font-medium text-white"
      style={{
        backgroundColor: avatarColor(id),
        width: size,
        height: size,
        fontSize: size * 0.38,
        borderRadius: "62% 38% 55% 45% / 45% 55% 45% 55%",
      }}
      title={name}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
