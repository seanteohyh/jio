import { describe, expect, it } from "vitest";
import { computeUserMetrics, computeKakiMetrics } from "@/lib/metrics";
import {
  computeFoodIdentity,
  computeKakiFoodIdentity,
  previousMonthKey,
} from "@/lib/foodIdentity";
import type { BudgetTier, KakiMember, Place, Visit } from "@/types";

function place(id: string, cuisine: string[], budget: BudgetTier = 2): Place {
  return {
    id,
    name: `Place ${id}`,
    address: null,
    lat: 1.3,
    lng: 103.85,
    cuisine,
    custom_cuisine_tags: [],
    budget_tier: budget,
    osm_id: null,
    source: "manual",
    status: "active",
    best_dishes: [],
    notes: null,
  };
}

function visit(
  placeId: string,
  rating: number,
  date: string,
  userId = "me"
): Visit {
  return {
    id: `${userId}-${placeId}-${date}`,
    place_id: placeId,
    user_id: userId,
    rating,
    best_dishes: [],
    notes: null,
    visited_at: date,
    is_public: false,
    like_count: 0,
  };
}

describe("computeFoodIdentity", () => {
  it("is 'Just getting started' below the visit floor", () => {
    const places = [place("a", ["japanese"])];
    const visits = [
      visit("a", 5, "2026-07-01"),
      visit("a", 5, "2026-07-02"),
    ];
    const card = computeFoodIdentity(computeUserMetrics(visits, places));
    expect(card.archetype).toBe("just_getting_started");
  });

  it("is The Loyalist when one cuisine is at least half of all visits", () => {
    const places = [
      place("a", ["japanese"]),
      place("b", ["japanese"]),
      place("c", ["thai"]),
    ];
    const visits = [
      visit("a", 4, "2026-07-01"),
      visit("a", 4, "2026-07-02"),
      visit("b", 4, "2026-07-03"),
      visit("c", 4, "2026-07-04"),
    ];
    const card = computeFoodIdentity(computeUserMetrics(visits, places));
    expect(card.archetype).toBe("loyalist");
    expect(card.headline).toBe("The Loyalist");
    expect(card.description).toContain("Japanese");
  });

  it("is The Explorer with 6+ distinct cuisines and no dominant one", () => {
    const cuisines = ["japanese", "thai", "korean", "indian", "malay", "western"];
    const places = cuisines.map((c, i) => place(String(i), [c]));
    const visits = places.map((p, i) =>
      visit(p.id, 4, `2026-07-0${i + 1}`)
    );
    const card = computeFoodIdentity(computeUserMetrics(visits, places));
    expect(card.archetype).toBe("explorer");
  });

  it("is The Regular when one place is at least 30% of all visits", () => {
    const places = [
      place("a", ["japanese"]),
      place("b", ["thai"]),
      place("c", ["korean"]),
      place("d", ["indian"]),
    ];
    const visits = [
      visit("a", 3, "2026-07-01"),
      visit("a", 3, "2026-07-02"),
      visit("b", 3, "2026-07-03"),
      visit("c", 3, "2026-07-04"),
      visit("d", 3, "2026-07-05"),
    ];
    const card = computeFoodIdentity(computeUserMetrics(visits, places));
    expect(card.archetype).toBe("regular");
    expect(card.description).toContain("Place a");
  });

  it("is The Enthusiast at a 4.5+ average rating with no dominant cuisine or place", () => {
    const places = [
      place("a", ["japanese"]),
      place("b", ["thai"]),
      place("c", ["korean"]),
      place("d", ["indian"]),
    ];
    const visits = [
      visit("a", 5, "2026-07-01"),
      visit("b", 5, "2026-07-02"),
      visit("c", 4, "2026-07-03"),
      visit("d", 5, "2026-07-04"),
    ];
    const card = computeFoodIdentity(computeUserMetrics(visits, places));
    expect(card.archetype).toBe("enthusiast");
  });

  it("is The Connoisseur at a mid-range average budget tier (2-3)", () => {
    const places = [
      place("a", ["japanese"], 3),
      place("b", ["thai"], 3),
      place("c", ["korean"], 2),
      place("d", ["indian"], 3),
    ];
    const visits = [
      visit("a", 3, "2026-07-01"),
      visit("b", 3, "2026-07-02"),
      visit("c", 3, "2026-07-03"),
      visit("d", 3, "2026-07-04"),
    ];
    const card = computeFoodIdentity(computeUserMetrics(visits, places));
    expect(card.archetype).toBe("connoisseur");
  });

  it("is Budget Hunter at the lowest budget tier", () => {
    const places = [
      place("a", ["japanese"], 1),
      place("b", ["thai"], 1),
      place("c", ["korean"], 1),
      place("d", ["indian"], 1),
    ];
    const visits = [
      visit("a", 3, "2026-07-01"),
      visit("b", 3, "2026-07-02"),
      visit("c", 3, "2026-07-03"),
      visit("d", 3, "2026-07-04"),
    ];
    const card = computeFoodIdentity(computeUserMetrics(visits, places));
    expect(card.archetype).toBe("budget_hunter");
  });

  it("falls back to The Well-Rounded Eater when nothing else matches", () => {
    const places = [
      place("a", ["japanese"], 5),
      place("b", ["thai"], 5),
      place("c", ["korean"], 5),
      place("d", ["indian"], 5),
    ];
    const visits = [
      visit("a", 3, "2026-07-01"),
      visit("b", 3, "2026-07-02"),
      visit("c", 3, "2026-07-03"),
      visit("d", 3, "2026-07-04"),
    ];
    const card = computeFoodIdentity(computeUserMetrics(visits, places));
    expect(card.archetype).toBe("well_rounded");
  });

  it("checks priority in order: a dominant cuisine wins over a high rating", () => {
    // Loyalist (japanese >= 50%) AND Enthusiast (avg 5.0) both technically
    // qualify — Loyalist must win since it's checked first.
    const places = [
      place("a", ["japanese"]),
      place("b", ["japanese"]),
      place("c", ["thai"]),
    ];
    const visits = [
      visit("a", 5, "2026-07-01"),
      visit("a", 5, "2026-07-02"),
      visit("b", 5, "2026-07-03"),
      visit("c", 5, "2026-07-04"),
    ];
    const card = computeFoodIdentity(computeUserMetrics(visits, places));
    expect(card.archetype).toBe("loyalist");
  });
});

function member(userId: string): KakiMember {
  return { kaki_id: "k1", user_id: userId, joined_at: "2026-06-01" };
}

describe("computeKakiFoodIdentity", () => {
  it("builds a group vibe headline from the dominant cuisine and budget label", () => {
    const places = [place("a", ["japanese"], 2), place("b", ["japanese"], 2)];
    const memberVisits = new Map<string, Visit[]>([
      ["u1", [visit("a", 4, "2026-07-01", "u1"), visit("b", 4, "2026-07-02", "u1")]],
      ["u2", [visit("a", 4, "2026-07-03", "u2")]],
    ]);
    const metrics = computeKakiMetrics(
      memberVisits,
      places,
      [member("u1"), member("u2")]
    );
    const card = computeKakiFoodIdentity(metrics);
    expect(card.headline).toContain("Japanese");
    expect(card.mostActive?.user_id).toBe("u1");
    expect(card.adventurer).not.toBeNull();
  });
});

describe("previousMonthKey", () => {
  it("returns the prior calendar month", () => {
    expect(previousMonthKey(new Date("2026-08-15T00:00:00Z"))).toBe("2026-07");
  });

  it("rolls back across a year boundary", () => {
    expect(previousMonthKey(new Date("2026-01-10T00:00:00Z"))).toBe("2025-12");
  });
});
