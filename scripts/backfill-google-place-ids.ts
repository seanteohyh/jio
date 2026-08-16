import { serviceClient } from "./_client";
import { findGooglePlaceId, hasGooglePlacesCredentials } from "../src/lib/googlePlaces";

/**
 * One-time resolve of every existing place's Google Place ID —
 * CHANGES_20260814.md §2, revisited. New places resolve themselves at
 * create/edit time (`resolveAndStoreGooglePlaceId`, called from the places
 * API routes); this catches everything added before that shipped, so the
 * "View on Google Maps" link upgrades to the real listing for old places
 * too, not just new ones — same "covers already-registered places" shape
 * as the original coordinate-link fix.
 *
 *   npm run backfill:google-places
 *
 * Safe to re-run: a place that already matched is never looked up again
 * (its `google_place_id` is no longer null), so a partial run — rate
 * limit, timeout, Ctrl-C — doesn't re-spend calls on places already
 * resolved. A place that didn't match last time gets tried again on the
 * next run, deliberately — there's no separate "checked, no match" marker,
 * so a transient failure or a listing Google didn't have indexed yet both
 * self-heal on the next run rather than getting permanently skipped.
 */
async function main() {
  const client = serviceClient();
  if (!client) process.exit(0);

  if (!hasGooglePlacesCredentials()) {
    console.log(
      "\n  GOOGLE_PLACES_API_KEY is not set — nothing to backfill.\n" +
        "  Set it in .env.local once you have a Google Cloud project with the\n" +
        "  Places API (New) enabled, then re-run this script.\n"
    );
    return;
  }

  const { data: places, error } = await client
    .from("places")
    .select("id, name, address, lat, lng")
    .is("google_place_id", null);

  if (error) {
    console.error("  Could not load places:", error.message);
    process.exit(1);
  }

  const rows = (places ?? []) as {
    id: string;
    name: string;
    address: string | null;
    lat: number;
    lng: number;
  }[];

  if (rows.length === 0) {
    console.log("  Every place already has a Google Place ID (or a checked non-match).\n");
    return;
  }

  console.log(`\n  Resolving ${rows.length} place(s)…\n`);

  let matched = 0;
  let checked = 0;

  for (const row of rows) {
    const placeId = await findGooglePlaceId(row.name, row.address, row.lat, row.lng);

    // Written either way — a `null` result here is indistinguishable from
    // "never checked" on the next run (see the file comment above), and
    // that's the intended trade-off, not an oversight.
    const { error: updateError } = await client
      .from("places")
      .update({ google_place_id: placeId })
      .eq("id", row.id);

    if (updateError) {
      console.error(`  ${row.name}: ${updateError.message}`);
    } else if (placeId) {
      matched += 1;
    }

    checked += 1;
    if (checked % 10 === 0 || checked === rows.length) {
      console.log(`  ${checked}/${rows.length}…`);
    }

    // A small gap between calls — polite to Google's API, not chasing a
    // documented rate limit for a run this small.
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`\n  Matched ${matched} of ${rows.length} place(s).\n`);
}

main().catch((error) => {
  console.error("  Unexpected failure:", error);
  process.exit(1);
});
