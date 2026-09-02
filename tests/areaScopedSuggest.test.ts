import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE } from "@/lib/constants";
import { haversine, estimateWalkMinutes } from "@/lib/utils";
import { STATIONS } from "@/lib/stations";

/**
 * Suggest Area Filter spec §4/§6 — the one piece this feature needs from the
 * shelved Home/Hangout plan: `listPlaces`'s `officeId` filter (and the
 * `enrich`/`walkTimes` functions behind it) widened to accept an ad-hoc
 * `{lat, lng}` point alongside the existing office id string, always
 * computing haversine directly and never consulting `walk_cache` for that
 * shape — an ad-hoc point has no stable key to cache against.
 */

beforeEach(() => {
  resetDemoStore();
});

describe("listPlaces officeId: {lat, lng}", () => {
  it("computes walk time via haversine directly, never consulting walk_cache", async () => {
    const { places: baseline } = await demoRepo.listPlaces({});
    const place = baseline[0];

    // Seed a deliberately wrong cached value under DEFAULT_OFFICE's own id —
    // if the ad-hoc-point path incorrectly fell back to a cache lookup keyed
    // on these same coordinates, this is the wrong number it would surface.
    await demoRepo.upsertWalkCache([
      {
        office_id: DEFAULT_OFFICE.id,
        place_id: place.id,
        walk_minutes: 999,
        distance_m: 999_000,
      },
    ]);

    // Confirm the cache seed actually took effect for the string-officeId
    // path (today's behaviour, unchanged) before proving the object path
    // ignores it.
    const { places: cached } = await demoRepo.listPlaces({
      officeId: DEFAULT_OFFICE.id,
    });
    expect(cached.find((p) => p.id === place.id)?.walk_minutes).toBe(999);

    // Same coordinates, passed as an ad-hoc {lat, lng} point instead of the
    // office id string — must bypass the cache entirely and compute fresh.
    const { places: adHoc } = await demoRepo.listPlaces({
      officeId: { lat: DEFAULT_OFFICE.lat, lng: DEFAULT_OFFICE.lng },
    });
    const found = adHoc.find((p) => p.id === place.id)!;
    const expectedDistance = haversine(
      DEFAULT_OFFICE.lat,
      DEFAULT_OFFICE.lng,
      place.lat,
      place.lng
    );
    expect(found.walk_minutes).toBe(estimateWalkMinutes(expectedDistance));
    expect(found.walk_minutes).not.toBe(999);
    expect(found.distance_m).toBe(Math.round(expectedDistance));
  });

  it("computes walk time correctly for a point nowhere near any office", async () => {
    // An arbitrary Suntec-area point, nothing to do with DEFAULT_OFFICE.
    const point = { lat: 1.2934, lng: 103.8607 };
    const { places } = await demoRepo.listPlaces({ officeId: point });
    const place = places[0];

    const expectedDistance = haversine(point.lat, point.lng, place.lat, place.lng);
    expect(place.walk_minutes).toBe(estimateWalkMinutes(expectedDistance));
  });

  it("leaves office-relative resolution (no officeId, or a string officeId) unchanged", async () => {
    const { places: implicit } = await demoRepo.listPlaces({});
    const { places: explicit } = await demoRepo.listPlaces({
      officeId: DEFAULT_OFFICE.id,
    });

    expect(implicit.map((p) => p.walk_minutes)).toEqual(
      explicit.map((p) => p.walk_minutes)
    );
  });
});

describe("STATIONS", () => {
  it("is a non-trivial, real dataset within Singapore's bounds", () => {
    expect(STATIONS.length).toBeGreaterThan(150);
    for (const station of STATIONS) {
      expect(station.lat).toBeGreaterThan(1.1);
      expect(station.lat).toBeLessThan(1.5);
      expect(station.lng).toBeGreaterThan(103.5);
      expect(station.lng).toBeLessThan(104.1);
      expect(station.lines.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate station names", () => {
    const names = STATIONS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("carries every serving line for known interchange stations", () => {
    const byName = new Map(STATIONS.map((s) => [s.name, s]));
    expect(byName.get("Dhoby Ghaut")?.lines.sort()).toEqual(["CC", "NE", "NS"]);
    expect(byName.get("City Hall")?.lines.sort()).toEqual(["EW", "NS"]);
    expect(byName.get("Promenade")?.lines.sort()).toEqual(["CC", "DT"]);
    expect(byName.get("Raffles Place")?.lines.sort()).toEqual(["EW", "NS"]);
  });
});
