import { serviceClient } from "./_client";
import { getWalkingRoute, hasOneMapCredentials } from "../src/lib/onemap";
import { estimateWalkMinutes, haversine } from "../src/lib/utils";

/**
 * Fill the walk-time cache.
 *
 *   npm run seed:walktimes
 *
 * One OneMap call per (office, place) pair, throttled to stay inside the
 * 200-per-minute limit. Results are cached forever because streets do not move.
 *
 * Without OneMap credentials it still runs, using straight-line estimates —
 * less accurate, but the app has numbers to show either way.
 */
async function main() {
  const client = serviceClient();
  if (!client) process.exit(0);

  const useOneMap = hasOneMapCredentials();
  console.log(
    useOneMap
      ? "\n  Using OneMap for real walking routes.\n"
      : "\n  No OneMap credentials — falling back to straight-line estimates.\n" +
          "  Set ONEMAP_EMAIL and ONEMAP_PASSWORD for accurate times.\n"
  );

  const [{ data: offices }, { data: places }] = await Promise.all([
    client.from("offices").select("id, name, lat, lng"),
    client.from("places").select("id, name, lat, lng"),
  ]);

  const officeList = (offices ?? []) as {
    id: string;
    name: string;
    lat: number;
    lng: number;
  }[];
  const placeList = (places ?? []) as {
    id: string;
    name: string;
    lat: number;
    lng: number;
  }[];

  if (officeList.length === 0 || placeList.length === 0) {
    console.log("  Nothing to compute — seed some places first.\n");
    return;
  }

  const { data: cached } = await client
    .from("walk_cache")
    .select("office_id, place_id");

  const done = new Set(
    ((cached ?? []) as { office_id: string; place_id: string }[]).map(
      (row) => `${row.office_id}:${row.place_id}`
    )
  );

  const rows: {
    office_id: string;
    place_id: string;
    walk_minutes: number;
    distance_m: number;
  }[] = [];

  let computed = 0;
  const total =
    officeList.length * placeList.length -
    officeList.flatMap((o) => placeList.filter((p) => done.has(`${o.id}:${p.id}`)))
      .length;

  for (const office of officeList) {
    for (const place of placeList) {
      const key = `${office.id}:${place.id}`;
      if (done.has(key)) continue;

      let walkMinutes: number;
      let distanceM: number;

      if (useOneMap) {
        const route = await getWalkingRoute(
          { lat: office.lat, lng: office.lng },
          { lat: place.lat, lng: place.lng }
        );
        walkMinutes = route.walk_minutes;
        distanceM = route.distance_m;
      } else {
        const distance = haversine(
          office.lat,
          office.lng,
          place.lat,
          place.lng
        );
        distanceM = Math.round(distance);
        walkMinutes = estimateWalkMinutes(distance);
      }

      rows.push({
        office_id: office.id,
        place_id: place.id,
        walk_minutes: walkMinutes,
        distance_m: distanceM,
      });

      computed += 1;
      if (computed % 10 === 0 || computed === total) {
        console.log(`  ${computed}/${total}…`);
      }
    }
  }

  if (rows.length === 0) {
    console.log("  Everything is already cached.\n");
    return;
  }

  // Chunked, because a single upsert of several hundred rows can time out on
  // the free tier.
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await client
      .from("walk_cache")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "office_id,place_id" });
    if (error) {
      console.error("  Upsert failed:", error.message);
      process.exit(1);
    }
  }

  console.log(`\n  Cached ${rows.length} walk times.\n`);
}

main().catch((error) => {
  console.error("  Unexpected failure:", error);
  process.exit(1);
});
