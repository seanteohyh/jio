import { describe, expect, it } from "vitest";
import {
  computeCuisineStreak,
  computeKakiMetrics,
  computeUserMetrics,
} from "@/lib/metrics";
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
  };
}

describe("computeUserMetrics", () => {
  it("returns zeroed metrics for someone with no history", () => {
    const metrics = computeUserMetrics([], []);

    expect(metrics.totalVisits).toBe(0);
    expect(metrics.distinctPlaces).toBe(0);
    expect(metrics.favouritePlaces).toEqual([]);
    expect(metrics.avgBudgetLabel).toBe("—");
  });

  it("counts visits and distinct places separately", () => {
    const places = [place("a", ["local"]), place("b", ["thai"])];
    const visits = [
      visit("a", 5, "2026-07-01"),
      visit("a", 4, "2026-07-08"),
      visit("b", 3, "2026-07-15"),
    ];
    const metrics = computeUserMetrics(visits, places);

    expect(metrics.totalVisits).toBe(3);
    expect(metrics.distinctPlaces).toBe(2);
  });

  it("ranks favourites by visit count", () => {
    const places = [place("a", ["local"]), place("b", ["thai"])];
    const visits = [
      visit("a", 3, "2026-07-01"),
      visit("a", 3, "2026-07-02"),
      visit("b", 5, "2026-07-03"),
    ];
    const metrics = computeUserMetrics(visits, places);

    expect(metrics.favouritePlaces[0].place_id).toBe("a");
  });

  it("breaks a visit-count tie on the rating you gave", () => {
    const places = [place("a", ["local"]), place("b", ["thai"])];
    const visits = [visit("a", 2, "2026-07-01"), visit("b", 5, "2026-07-02")];
    const metrics = computeUserMetrics(visits, places);

    expect(metrics.favouritePlaces[0].place_id).toBe("b");
  });

  it("caps favourites at five", () => {
    const places = Array.from({ length: 8 }, (_, i) =>
      place(`p${i}`, ["local"])
    );
    const visits = places.map((p, i) =>
      visit(p.id, 4, `2026-07-${String(i + 1).padStart(2, "0")}`)
    );
    const metrics = computeUserMetrics(visits, places);

    expect(metrics.favouritePlaces).toHaveLength(5);
  });

  it("produces cuisine shares that sum to one", () => {
    const places = [
      place("a", ["japanese"]),
      place("b", ["thai", "local"]),
    ];
    const visits = [visit("a", 4, "2026-07-01"), visit("b", 4, "2026-07-02")];
    const metrics = computeUserMetrics(visits, places);

    const total = Object.values(metrics.cuisineBreakdown).reduce(
      (a, b) => a + b,
      0
    );
    expect(total).toBeCloseTo(1);
  });

  it("splits a multi-cuisine visit evenly rather than double-counting it", () => {
    const places = [place("b", ["thai", "local"])];
    const metrics = computeUserMetrics([visit("b", 4, "2026-07-02")], places);

    expect(metrics.cuisineBreakdown.thai).toBeCloseTo(0.5);
    expect(metrics.cuisineBreakdown.local).toBeCloseTo(0.5);
  });

  it("weights the budget average by how often you go", () => {
    const places = [place("cheap", ["local"], 1), place("posh", ["western"], 4)];
    const visits = [
      visit("cheap", 4, "2026-07-01"),
      visit("cheap", 4, "2026-07-02"),
      visit("cheap", 4, "2026-07-03"),
      visit("posh", 4, "2026-07-04"),
    ];
    const metrics = computeUserMetrics(visits, places);

    // (1 + 1 + 1 + 4) / 4 = 1.75
    expect(metrics.avgBudgetTier).toBeCloseTo(1.75);
    expect(metrics.avgBudgetLabel).toBe("$$");
  });

  it("finds the busiest month", () => {
    const places = [place("a", ["local"])];
    const visits = [
      visit("a", 4, "2026-06-01"),
      visit("a", 4, "2026-07-01"),
      visit("a", 4, "2026-07-02"),
    ];
    const metrics = computeUserMetrics(visits, places);

    expect(metrics.mostActiveMonth).toBe("2026-07");
  });

  it("counts variety over the last 30 days only", () => {
    const now = new Date("2026-07-29");
    const recent = new Date("2026-07-20").toISOString().slice(0, 10);
    const old = new Date("2026-01-20").toISOString().slice(0, 10);

    const places = [place("a", ["local"]), place("b", ["thai"])];
    const metrics = computeUserMetrics(
      [visit("a", 4, recent), visit("b", 4, old)],
      places,
      now
    );

    expect(metrics.currentVariety).toBe(1);
  });

  it("averages the ratings you gave", () => {
    const places = [place("a", ["local"])];
    const visits = [visit("a", 5, "2026-07-01"), visit("a", 3, "2026-07-02")];

    expect(computeUserMetrics(visits, places).avgRatingGiven).toBeCloseTo(4);
  });
});

describe("computeKakiMetrics", () => {
  const members: KakiMember[] = [
    { kaki_id: "k", user_id: "alex" },
    { kaki_id: "k", user_id: "mei" },
  ];

  it("returns zeroed metrics for a group that has never eaten", () => {
    const metrics = computeKakiMetrics(new Map(), [], members);

    expect(metrics.groupTotalVisits).toBe(0);
    expect(metrics.mostActiveMember).toBeNull();
  });

  it("ranks group favourites on member coverage, not raw visits", () => {
    const places = [place("popular", ["local"]), place("obsession", ["thai"])];

    // Alex has been to "obsession" four times; both members have been to
    // "popular" once each. For a group pick, coverage wins.
    const visits = new Map([
      [
        "alex",
        [
          visit("obsession", 5, "2026-07-01", "alex"),
          visit("obsession", 5, "2026-07-02", "alex"),
          visit("obsession", 5, "2026-07-03", "alex"),
          visit("obsession", 5, "2026-07-04", "alex"),
          visit("popular", 4, "2026-07-05", "alex"),
        ],
      ],
      ["mei", [visit("popular", 4, "2026-07-06", "mei")]],
    ]);

    const metrics = computeKakiMetrics(visits, places, members);
    expect(metrics.groupFavouritePlaces[0].place_id).toBe("popular");
  });

  it("names the most active member and the adventurer separately", () => {
    const places = [
      place("a", ["local"]),
      place("b", ["thai"]),
      place("c", ["japanese"]),
    ];

    const visits = new Map([
      // Alex goes out most, but always to the same place.
      [
        "alex",
        [
          visit("a", 4, "2026-07-01", "alex"),
          visit("a", 4, "2026-07-02", "alex"),
          visit("a", 4, "2026-07-03", "alex"),
        ],
      ],
      // Mei goes out less, but tries more.
      [
        "mei",
        [
          visit("a", 4, "2026-07-01", "mei"),
          visit("b", 4, "2026-07-02", "mei"),
        ],
      ],
    ]);

    const metrics = computeKakiMetrics(visits, places, members);

    expect(metrics.mostActiveMember?.user_id).toBe("alex");
    expect(metrics.adventurer?.user_id).toBe("mei");
  });

  it("ignores visits from people who are not members", () => {
    const places = [place("a", ["local"])];
    const visits = new Map([
      ["alex", [visit("a", 4, "2026-07-01", "alex")]],
      ["stranger", [visit("a", 4, "2026-07-02", "stranger")]],
    ]);

    expect(computeKakiMetrics(visits, places, members).groupTotalVisits).toBe(1);
  });
});

describe("computeCuisineStreak", () => {
  const places = [
    place("jp1", ["japanese"]),
    place("jp2", ["japanese"]),
    place("jp3", ["japanese"]),
    place("th1", ["thai"]),
  ];

  it("returns null with fewer than two eating days", () => {
    expect(computeCuisineStreak([visit("jp1", 4, "2026-07-01")], places)).toBeNull();
  });

  it("counts a run of days sharing a cuisine", () => {
    const streak = computeCuisineStreak(
      [
        visit("jp1", 4, "2026-07-01"),
        visit("jp2", 4, "2026-07-02"),
        visit("jp3", 4, "2026-07-03"),
      ],
      places
    );

    expect(streak).not.toBeNull();
    expect(streak?.cuisine).toBe("japanese");
    expect(streak?.days).toBe(3);
  });

  it("stops the streak at a day with a different cuisine", () => {
    const streak = computeCuisineStreak(
      [
        visit("jp1", 4, "2026-07-01"),
        visit("th1", 4, "2026-07-02"),
        visit("jp2", 4, "2026-07-03"),
        visit("jp3", 4, "2026-07-04"),
      ],
      places
    );

    // Only the last two days count; the Thai day broke it.
    expect(streak?.cuisine).toBe("japanese");
    expect(streak?.days).toBe(2);
  });

  it("does not break a streak across a day with no visit", () => {
    // Monday and Wednesday Japanese, nothing on Tuesday, is still a streak.
    const streak = computeCuisineStreak(
      [visit("jp1", 4, "2026-07-01"), visit("jp2", 4, "2026-07-03")],
      places
    );

    expect(streak?.days).toBe(2);
  });

  it("returns null when consecutive days share nothing", () => {
    expect(
      computeCuisineStreak(
        [visit("jp1", 4, "2026-07-01"), visit("th1", 4, "2026-07-02")],
        places
      )
    ).toBeNull();
  });
});
