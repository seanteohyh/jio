import type { FavouritePlace } from "@/types";

/**
 * UX review log #24 — group favourites restyled as a stamp card: one dot
 * per visit, instead of a plain "N visits" number. Same ranking and data
 * as before (`groupFavouritePlaces`, already sorted by distinct-member
 * count then visits) — this only changes how the count is drawn.
 */
export default function FavouritesStampCard({
  favourites,
}: {
  favourites: FavouritePlace[];
}) {
  return (
    <ul className="space-y-3">
      {favourites.map((fav, index) => (
        <li key={fav.place_id}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ink truncate text-sm">
              <span className="text-stone mr-1.5 text-xs">{index + 1}</span>
              {fav.place_name}
            </span>
            <span className="text-stone shrink-0 text-xs tabular-nums">
              {fav.avg_rating.toFixed(1)}★
            </span>
          </div>
          <div
            className="mt-1 flex flex-wrap items-center gap-1"
            role="img"
            aria-label={`${fav.visit_count} visit${fav.visit_count === 1 ? "" : "s"}`}
          >
            {Array.from({ length: Math.min(fav.visit_count, 20) }).map(
              (_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="bg-ember h-2 w-2 rounded-full"
                />
              )
            )}
            {fav.visit_count > 20 && (
              <span aria-hidden="true" className="text-stone text-[10px] leading-4">
                +{fav.visit_count - 20}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
