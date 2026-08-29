/**
 * The bespoke Jio icon language — UX review log #20. Replaces the generic
 * lucide-react set app-wide, not just at the highest-traffic spots.
 *
 * Every component here has the exact same prop shape lucide's icons did
 * (`React.SVGProps<SVGSVGElement>`, spread onto the root `<svg>`), so every
 * call site keeps working — sizing via `className` (e.g. `h-4 w-4`),
 * `strokeWidth`, `fill` (for a toggleable filled/outline state, e.g.
 * `SaveButton`'s bookmark) and `aria-hidden` all still apply exactly as
 * they did before. Only the import and the JSX tag name change.
 *
 * Standing principle (doc's own words): every icon's signature dot must be
 * visibly grounded in the object it sits on — a hole, a head, a badge, a
 * spot, a crossing point — never floating free in empty space. Wherever an
 * icon below has such a dot, it's drawn as a separate `fill="currentColor"
 * stroke="none"` circle sitting *on* a stroked shape, not next to it.
 *
 * Two brand-logo glyphs are a deliberate exception, not an oversight:
 * `FacebookIcon`/`InstagramIcon` (used only in `SocialsIcon` to identify
 * which real external service a link points to) keep their recognizable
 * real-world marks rather than being redrawn into this house style — a
 * user needs to recognize "this is Instagram," not "this matches Jio's
 * icon language." `LinkIcon`, the generic same-component fallback for an
 * unrecognized domain, is redrawn like everything else.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg(props: IconProps & { children: React.ReactNode }) {
  const { children, ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Nav: Home. */
export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
      <path d="M10 20v-5h4v5" />
    </Svg>
  );
}

/**
 * Nav: Jios. A serving-dome/bell shape — a Jio is a shared meal called
 * together, not an entry on a calendar. Corrected to match the finalized
 * visual spec's reference sheet exactly. The signature dot is grounded as
 * the dome's own finial, on a short stem rising straight out of its peak.
 */
export function JiosIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 15h11" />
      <path d="M8 15Q8 8 12 8Q16 8 16 15" />
      <path d="M12 8V6.3" />
      <circle cx="12" cy="5.6" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/**
 * Nav: Kaki, and any other "a group of people" context (InvitePicker's
 * group rows, PlaceCard's Kaki-favourite count). Three overlapping
 * pebbles — the brand mark's own stated meaning, "teammates gathering,"
 * matching JioMark's own three-pebble arrangement rather than a pair.
 * Corrected to three per the finalized visual spec's reference sheet. The
 * signature dot sits grounded at the exact point all three circles meet.
 */
export function KakiIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="9.6" r="4.3" />
      <circle cx="15" cy="9.6" r="4.3" />
      <circle cx="12" cy="15.2" r="4.3" />
      <circle cx="12" cy="11.3" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/**
 * Nav: You / Profile. A plain person silhouette — head and shoulders, no
 * face — per the finalized visual spec's reference sheet, replacing the
 * earlier smiling-pebble treatment. The signature dot is grounded where
 * the shoulder line meets the neck.
 */
export function YouIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="7.6" r="3.2" />
      <path d="M6.3 19c0-3.6 2.6-6.1 5.7-6.1s5.7 2.5 5.7 6.1" />
      <circle cx="15.3" cy="14.1" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/**
 * "A place" — nav: Places, and any location-pin context for one specific
 * place (an option's Google Maps link, a card's address). Corrected per
 * visual QA to a standard pin orientation — round top, point down — with
 * only a filled dot for the hole, replacing an earlier inverted shape that
 * fought the universal pin convention.
 */
export function PlaceIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z" />
      <circle cx="12" cy="9" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/**
 * Nav: Map — the map *view* itself, distinct from `PlaceIcon`'s single-pin
 * mark so the two tabs don't collide visually. A folded paper map with one
 * small "you are here" dot grounded on a fold line.
 */
export function MapIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
      <circle cx="9" cy="11" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/**
 * Walk time. Redrawn per visual QA as a full walking-figure pictogram — the
 * signature dot is unambiguously the head, connected straight into the
 * torso stroke, not floating disconnected above two separate leg-strokes.
 */
export function WalkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="13.2" cy="4.2" r="1.6" fill="currentColor" stroke="none" />
      <path d="M13.2 5.9 10.6 9l-3 1.4M13.2 5.9l2.8 2.3 2.6 1M10.6 9l1 4-3.1 4.8M11.6 13l2.8 1.9-.9 4.1" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </Svg>
  );
}

/** Save-for-later. `fill` toggles between outline and filled — see SaveButton. */
export function BookmarkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 5l14 14M19 5 5 19" />
    </Svg>
  );
}

/** Read-only rating displays (`Stars` in ui.tsx) keep their own glyph — this
 *  is only for the one inline lucide `Star` use in MetricsCharts. */
export function StarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 3 2.6 5.6 6 .7-4.4 4.1 1.2 6-5.4-3-5.4 3 1.2-6L3.4 9.3l6-.7Z" />
    </Svg>
  );
}

/** Verified/secure badge — also reused as-is for the Halal certification tag
 *  (per the doc: Halal is a certification, not a cuisine, so it gets this
 *  icon rather than a food picture). */
export function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 5 6v5.2c0 4.7 3 8 7 9.3 4-1.3 7-4.6 7-9.3V6l-7-2.5Z" />
      <path d="m9 12 2 2 4-4.2" />
    </Svg>
  );
}

/** Errors / failed-fetch retry states. The dot is the exclamation mark's own
 *  base, already naturally grounded on the triangle. */
export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 21.5 20h-19Z" />
      <path d="M12 9.5v4.2" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Svg>
  );
}

/** A confirmed / resolved state (e.g. a settled vote). */
export function CheckCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.3 2.6 2.6 4.4-5.2" />
    </Svg>
  );
}

/** "Add this to the pool" / add-a-new-thing actions. */
export function PlusCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5v11.5M8 11.5l4 4 4-4" />
      <path d="M5 17v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V17" />
    </Svg>
  );
}

export function QrIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h3v3h-3zM20.5 14v3M14 20.5h3M20.5 20.5h.01" />
    </Svg>
  );
}

/** Depicts the real device chrome, so it stays recognizable as an actual
 *  phone rather than following the house style purely — same reasoning as
 *  the brand-logo exception above. */
export function PhoneIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2" />
      <path d="M11 18.5h2" />
    </Svg>
  );
}

/** iOS's own share glyph (arrow rising out of a box) — kept recognizable
 *  since the instructional copy next to it is telling someone to find this
 *  exact icon in their real system UI. */
export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v11" />
      <path d="M8.5 6.5 12 3l3.5 3.5" />
      <path d="M6 11v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8" />
    </Svg>
  );
}

/** iOS's own "add" glyph — same reasoning as `ShareIcon`. */
export function AddSquareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </Svg>
  );
}

/** Generic "plain link" fallback in `SocialsIcon` — the one glyph there
 *  that isn't a real third-party mark, so it's redrawn like everything
 *  else. */
export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 7.5 12.6 6a3.5 3.5 0 1 1 5 5L16 12.5" />
      <path d="M13 16.5 11.4 18a3.5 3.5 0 1 1-5-5L8 11.5" />
    </Svg>
  );
}

// ---------------------------------------------------------------------
// Food-category icons — the doc's grouping table. 18 cuisine tags don't
// each need their own glyph; several share one, grouped by what the food
// actually looks/feels like rather than one icon per tag:
//
//   noodle-bowl : chinese, japanese, korean, thai, vietnamese, local,
//                 food_court (hawker-coded, so it reuses this one), and
//                 traditional (closest in spirit to "local")
//   wok         : malay, indian
//   bakery      : western, italian, dessert, and fast_food (the closest
//                 fit among the four groups for quick Western-style food)
//   kopi        : cafe, modern
//   (halal is a certification, not a cuisine — see ShieldIcon above)
//   mushroom    : vegetarian (its own icon, not grouped — a dietary need,
//                 not a cuisine, so it doesn't fit any of the four)
//
// Built now for #20; the first consumer is #24/#75's Kaki-page plate.
// ---------------------------------------------------------------------

export function NoodleBowlIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 12.5h17a8.5 4 0 0 1-17 0Z" />
      <path d="M12 12.5V7M9 9l1.5 3.5M15 9l-1.5 3.5" />
    </Svg>
  );
}

export function WokIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 11.5h18a7 5 0 0 1-14 0Z" />
      <path d="M3 11.5 1 9.5M21 11.5l2-2" />
    </Svg>
  );
}

/**
 * A loaf with score-marks — redrawn per visual QA (was a generic dome).
 * The dot sits as a seed on top of one score-mark, grounded rather than
 * floating over plain crust.
 */
export function BakeryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12.5a8 6 0 0 1 16 0v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M9 9.5c.5 1.2.5 2.3 0 3.5M14 9.2c.5 1.2.5 2.3 0 3.5" />
      <circle cx="14" cy="8.7" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function KopiIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" />
      <path d="M16 10.5h1.5a2 2 0 0 1 0 4H16" />
      <path d="M8 6c.4-1 0-1.3-.3-2M12 6c.4-1 0-1.3-.3-2" />
    </Svg>
  );
}

/**
 * Vegetarian — redrawn per visual QA as a mushroom (was reading as a
 * shopping bag): cap, stem, spots. One spot is the grounded dot, sitting
 * directly on the cap's curve.
 */
export function MushroomIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12A8 6 0 0 1 20 12Z" />
      <path d="M9.5 12v5a2.5 2.5 0 0 0 5 0v-5" />
      <circle cx="14.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/**
 * Budget — a price tag, dot as the tag's own punch-hole. Built for #74/#75
 * (the Kaki-page "typical spend" gauge); no call site consumes it yet.
 */
export function BudgetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12.5 3.5H20v7.5a1 1 0 0 1-.3.7l-8 8a1 1 0 0 1-1.4 0l-6.5-6.5a1 1 0 0 1 0-1.4l8-8a1 1 0 0 1 .7-.3Z" />
      <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}
