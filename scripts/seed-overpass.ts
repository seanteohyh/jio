import { serviceClient, DEFAULT_OFFICE_ID } from "./_client";
import {
  dedupePlaces,
  fetchOverpassElements,
  normalizeElement,
} from "../src/lib/discovery";
import { WALK_RADIUS_M } from "../src/lib/constants";
import type { PlaceCandidate } from "../src/types";

/**
 * Import nearby food places from OpenStreetMap.
 *
 *   npm run seed:overpass
 *
 * Everything lands with status 'needs_review'. OSM coverage is uneven — some
 * entries are closed businesses, some are vending machines tagged as cafes —
 * so a human confirms each one in the app before it reaches suggestions.
 */
async function main() {
  const client = serviceClient();
  if (!client) process.exit(0);

  const { data: officeRow } = await client
    .from("offices")
    .select("lat, lng, name")
    .eq("id", DEFAULT_OFFICE_ID)
    .maybeSingle();

  const office = (officeRow as { lat: number; lng: number; name: string } | null) ?? {
    lat: 1.2966,
    lng: 103.852,
    name: "the default office",
  };

  console.log(
    `\n  Looking for food places within ${WALK_RADIUS_M}m of ${office.name}…\n`
  );

  const elements = await fetchOverpassElements(
    office.lat,
    office.lng,
    WALK_RADIUS_M
  );
  console.log(`  Overpass returned ${elements.length} elements.`);

  const candidates = elements
    .map(normalizeElement)
    .filter((c): c is PlaceCandidate => c !== null);
  console.log(`  ${candidates.length} had a name and coordinates.`);

  const { data: existing } = await client
    .from("places")
    .select("name, lat, lng, osm_id");

  const fresh = dedupePlaces(
    candidates,
    (existing ?? []) as { name: string; lat: number; lng: number; osm_id: number | null }[]
  );
  console.log(`  ${fresh.length} are new.\n`);

  if (fresh.length === 0) {
    console.log("  Nothing to add.\n");
    return;
  }

  const { data, error } = await client
    .from("places")
    .upsert(
      fresh.map((candidate) => ({
        name: candidate.name,
        address: candidate.address,
        lat: candidate.lat,
        lng: candidate.lng,
        cuisine: candidate.cuisine,
        budget_tier: candidate.budget_tier,
        osm_id: candidate.osm_id,
        source: "osm_seed",
        status: "needs_review",
      })),
      { onConflict: "osm_id", ignoreDuplicates: true }
    )
    .select("id");

  if (error) {
    console.error("  Insert failed:", error.message);
    process.exit(1);
  }

  console.log(
    `  Added ${(data ?? []).length} places to the review queue.\n` +
      `  Open /places in the app to approve them.\n`
  );
}

main().catch((error) => {
  console.error("  Unexpected failure:", error);
  process.exit(1);
});
