import { NextRequest, NextResponse } from "next/server";
import { getRepoAsync } from "@/lib/data/repo";
import { getDiscoveryProvider } from "@/lib/providers/discovery";
import { json, unauthorized } from "@/lib/api";
import { config, featureGate } from "@/lib/config";
import { DEFAULT_OFFICE, WALK_RADIUS_M } from "@/lib/constants";

/**
 * Daily discovery cron.
 *
 * Two jobs, one request:
 *  1. Import nearby OSM food places into the review queue.
 *  2. Touch the database, which keeps a Supabase free-tier project from being
 *     paused for inactivity after a week. That second job is the reason this
 *     runs even on days when there is nothing new to find.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;

  // With no secret configured this endpoint would be an open write path, so
  // it refuses to run rather than defaulting to open.
  if (!secret) return false;

  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  const blocked = featureGate("discovery");
  if (blocked) return blocked as NextResponse;

  if (!isAuthorized(request)) {
    return unauthorized("This endpoint requires a valid CRON_SECRET");
  }

  const repo = await getRepoAsync();

  // The keep-alive query. Runs first so an Overpass outage cannot stop it.
  const offices = await repo.listOffices();
  const targets = offices.length > 0 ? offices : [DEFAULT_OFFICE];

  const provider = getDiscoveryProvider();
  if (provider.name === "none") {
    return json({ fetched: 0, new: 0, skipped: 0, keepAlive: true });
  }

  // One sweep per office, run one after another rather than in parallel —
  // simplest way to avoid hammering Overpass with N simultaneous requests
  // now that there can be more than one office. This is a starting point,
  // not a considered rate-limiting strategy: as the number of offices grows,
  // pacing (batching, delays, a slower cadence per office) is a real open
  // question, deliberately not designed yet — see the change log.
  const results: Array<{
    office: string;
    fetched: number;
    new: number;
    skipped: number;
    errors: string[];
  }> = [];

  for (const office of targets) {
    try {
      const existing = await repo.listPlaces({ status: "all" });

      const { fetched, candidates } = await provider.discover(
        office.lat,
        office.lng,
        existing,
        WALK_RADIUS_M
      );

      let created = 0;
      const errors: string[] = [];

      const rows = candidates.map((candidate) => ({
        name: candidate.name,
        address: candidate.address ?? null,
        lat: candidate.lat,
        lng: candidate.lng,
        cuisine: candidate.cuisine,
        budget_tier: candidate.budget_tier,
        osm_id: candidate.osm_id,
        source: "discovery" as const,
        status: "needs_review" as const,
        best_dishes: [] as string[],
        notes: null,
        created_by: null,
      }));

      if (config.isDemo) {
        // In-memory repo — nothing to elevate.
        for (const row of rows) {
          try {
            await repo.createPlace(row);
            created += 1;
          } catch (error) {
            errors.push(
              `${row.name}: ${
                error instanceof Error ? error.message : "unknown error"
              }`
            );
          }
        }
      } else if (rows.length > 0) {
        // There is no user session in a cron run, so the normal anon-key
        // path would be rejected by the places INSERT policy (created_by =
        // auth.uid()). This is the one and only caller allowed to bypass RLS.
        const { createServiceRoleClient } = await import(
          "@/lib/supabase/serviceClient"
        );
        const admin = createServiceRoleClient();

        const { data, error } = await admin
          .from("places")
          .upsert(rows, { onConflict: "osm_id", ignoreDuplicates: true })
          .select("id");

        if (error) {
          errors.push(error.message);
        } else {
          created = (data ?? []).length;
        }
      }

      results.push({
        office: office.name,
        fetched,
        new: created,
        skipped: fetched - created,
        errors: errors.slice(0, 5),
      });
    } catch (error) {
      // One office's Overpass call failing should not stop the rest —
      // record it and move on to the next office.
      results.push({
        office: office.name,
        fetched: 0,
        new: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : "Discovery failed"],
      });
    }
  }

  return json({
    provider: provider.name,
    demo: config.isDemo,
    offices: results,
    fetched: results.reduce((sum, r) => sum + r.fetched, 0),
    new: results.reduce((sum, r) => sum + r.new, 0),
    skipped: results.reduce((sum, r) => sum + r.skipped, 0),
  });
}
