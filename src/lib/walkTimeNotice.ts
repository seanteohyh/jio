/**
 * A newly added place farther than Places/Map's shared default walk-time
 * filter is correctly excluded from both by default — but with nothing
 * saying why on the place's own page, that reads as the place having
 * silently vanished rather than just being filtered.
 *
 * Past the walk-time slider's own ceiling, widening the filter wouldn't
 * help at all (nothing sets it that high), so that case gets its own,
 * more final-sounding message rather than pointing at a dead end.
 */
export function walkTimeVisibilityNotice(
  walkMinutes: number | null | undefined,
  opts: { defaultMaxWalk: number; sliderMax: number }
): string | null {
  if (typeof walkMinutes !== "number" || walkMinutes <= opts.defaultMaxWalk) {
    return null;
  }

  if (walkMinutes > opts.sliderMax) {
    return `This is a ${walkMinutes}-min walk from the office — too far to appear in Places, Map, or a Jio's place search, since all three cap out at 60 min or less. This link still works directly, and logging a visit here doesn't have a distance limit.`;
  }

  return `This is a ${walkMinutes}-min walk from the office — past the default ${opts.defaultMaxWalk}-min filter on Places and Map, so it won't show up there unless that filter is widened.`;
}
