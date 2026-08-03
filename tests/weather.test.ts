import { describe, expect, it } from "vitest";
import { isRainLikely } from "@/lib/weather";
import { rankPlaces, walkPenaltyScore } from "@/lib/recommend";
import { RECOMMEND_CONFIG as C } from "@/lib/recommendConfig";
import type { BudgetTier, Place } from "@/types";

function place(id: string, walkMinutes: number): Place {
  return {
    id,
    name: id,
    address: null,
    lat: 1.3,
    lng: 103.85,
    cuisine: ["local"],
    custom_cuisine_tags: [],
    budget_tier: 2 as BudgetTier,
    osm_id: null,
    source: "manual",
    status: "active",
    best_dishes: [],
    notes: null,
    walk_minutes: walkMinutes,
  };
}

describe("isRainLikely", () => {
  it("matches the NEA wet-weather vocabulary", () => {
    expect(isRainLikely("Light Rain")).toBe(true);
    expect(isRainLikely("Passing Showers")).toBe(true);
    expect(isRainLikely("Thundery Showers")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(isRainLikely("HEAVY RAIN")).toBe(true);
  });

  it("returns false for dry forecasts", () => {
    expect(isRainLikely("Partly Cloudy (Day)")).toBe(false);
    expect(isRainLikely("Fair (Day)")).toBe(false);
    expect(isRainLikely("Hazy")).toBe(false);
  });

  it("returns false rather than throwing on null or undefined", () => {
    expect(isRainLikely(null)).toBe(false);
    expect(isRainLikely(undefined)).toBe(false);
  });
});

describe("weather-aware ranking", () => {
  it("doubles the walk penalty when rain is likely", () => {
    const p = place("far", 20);

    expect(walkPenaltyScore(p, C.walk.rainMultiplier)).toBeCloseTo(
      walkPenaltyScore(p, 1) * C.walk.rainMultiplier
    );
  });

  it("leaves places inside the free walk window untouched", () => {
    // Nobody minds three minutes, rain or not.
    const p = place("near", 3);

    expect(walkPenaltyScore(p, C.walk.rainMultiplier)).toBe(0);
  });

  it("scales the floor too, so very distant places stay ordered", () => {
    const p = place("miles", 500);

    expect(walkPenaltyScore(p, 2)).toBe(C.walk.floor * 2);
    expect(walkPenaltyScore(p, 2)).toBeLessThan(walkPenaltyScore(p, 1));
  });

  it("widens the gap between near and far places when it rains", () => {
    const places = [place("near", 4), place("far", 25)];

    const dry = rankPlaces(places, [], null, [], { weatherMultiplier: 1 });
    const wet = rankPlaces(places, [], null, [], {
      weatherMultiplier: C.walk.rainMultiplier,
    });

    const gap = (ranked: typeof dry) => {
      const near = ranked.find((s) => s.place.id === "near")!.score;
      const far = ranked.find((s) => s.place.id === "far")!.score;
      return near - far;
    };

    expect(wet[0].place.id).toBe("near");
    expect(gap(wet)).toBeGreaterThan(gap(dry));
  });
});
