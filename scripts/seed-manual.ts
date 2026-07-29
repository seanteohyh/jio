import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { serviceClient } from "./_client";

/**
 * Seed the hand-curated places.
 *
 * Run once against a fresh database:
 *   npm run seed:manual
 *
 * Safe to re-run: existing names are skipped rather than duplicated.
 */

interface SeedPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
  cuisine: string[];
  budget_tier: number;
  best_dishes?: string[];
  notes?: string;
}

async function main() {
  const client = serviceClient();
  if (!client) process.exit(0);

  const path = resolve(process.cwd(), "scripts/manual-seed.json");
  const places: SeedPlace[] = JSON.parse(readFileSync(path, "utf8"));

  console.log(`\n  Seeding ${places.length} curated places…\n`);

  const { data: existing, error: readError } = await client
    .from("places")
    .select("name");

  if (readError) {
    console.error("  Could not read existing places:", readError.message);
    process.exit(1);
  }

  const known = new Set(
    ((existing ?? []) as { name: string }[]).map((p) => p.name.toLowerCase())
  );

  const rows = places
    .filter((place) => !known.has(place.name.toLowerCase()))
    .map((place) => ({
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      cuisine: place.cuisine,
      budget_tier: place.budget_tier,
      source: "manual",
      status: "active",
      best_dishes: place.best_dishes ?? [],
      notes: place.notes ?? null,
    }));

  if (rows.length === 0) {
    console.log("  Everything is already there. Nothing to do.\n");
    return;
  }

  const { data, error } = await client.from("places").insert(rows).select("id");

  if (error) {
    console.error("  Insert failed:", error.message);
    process.exit(1);
  }

  console.log(
    `  Added ${(data ?? []).length} places. ` +
      `Skipped ${places.length - rows.length} already present.\n`
  );
}

main().catch((error) => {
  console.error("  Unexpected failure:", error);
  process.exit(1);
});
