import { describe, expect, it } from "vitest";
import {
  bayesianRatingScore,
  budgetFitScore,
  cuisineAffinityScore,
  groupRecommend,
  isExcluded,
  learnCuisineAffinity,
  rankPlaces,
  surprisePick,
  surprisePicks,
  varietyBonusScore,
  walkPenaltyScore,
  whyHint,
} from "@/lib/recommend";
import { RECOMMEND_CONFIG as C } from "@/lib/recommendConfig";
import type { BudgetTier, Place, UserPrefs, Visit } from "@/types";

function place(overrides: Partial<Place> & { id: string }): Place {
  return {
    name: overrides.id,
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
    walk_minutes: 5,
    ...overrides,
  };
}

function visit(
  placeId: string,
  rating: number,
  daysAgo = 30,
  userId = "me"
): Visit {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return {
    id: `${placeId}-${daysAgo}`,
    place_id: placeId,
    user_id: userId,
    rating,
    best_dishes: [],
    notes: null,
    visited_at: date.toISOString().slice(0, 10),
    is_public: false,
    like_count: 0,
  };
}

function prefs(overrides: Partial<UserPrefs> = {}): UserPrefs {
  return {
    user_id: "me",
    cuisine_likes: [],
    cuisine_dislikes: [],
    budget_min: 1,
    budget_max: 4,
    blocklist: [],
    default_office_id: null,
    reminders_enabled: true,
    reminder_lead_minutes: 30,
    ...overrides,
  };
}

describe("learnCuisineAffinity", () => {
  it("centres a rating on the midpoint of the scale", () => {
    const places = [place({ id: "p1", cuisine: ["japanese"] })];
    // A 5-star rating: (5 - 3) / 2 = 1.0
    const learned = learnCuisineAffinity([visit("p1", 5)], places);

    expect(learned.get("japanese")).toBeCloseTo(1.0);
  });

  it("produces a negative affinity for consistently poor ratings", () => {
    const places = [place({ id: "p1", cuisine: ["western"] })];
    const learned = learnCuisineAffinity([visit("p1", 1)], places);

    expect(learned.get("western")).toBeLessThan(0);
  });

  it("credits every cuisine a place carries", () => {
    const places = [place({ id: "p1", cuisine: ["japanese", "cafe"] })];
    const learned = learnCuisineAffinity([visit("p1", 5)], places);

    expect(learned.get("japanese")).toBeCloseTo(1.0);
    expect(learned.get("cafe")).toBeCloseTo(1.0);
  });
});

describe("cuisineAffinityScore", () => {
  it("adds a bonus for an explicitly liked cuisine", () => {
    const p = place({ id: "p1", cuisine: ["thai"] });
    const neutral = cuisineAffinityScore(p, new Map(), null);
    const liked = cuisineAffinityScore(
      p,
      new Map(),
      prefs({ cuisine_likes: ["thai"] })
    );

    expect(liked - neutral).toBeCloseTo(C.cuisine.likeBonus);
  });

  it("subtracts a penalty for an explicitly disliked cuisine", () => {
    const p = place({ id: "p1", cuisine: ["thai"] });
    const disliked = cuisineAffinityScore(
      p,
      new Map(),
      prefs({ cuisine_dislikes: ["thai"] })
    );

    expect(disliked).toBeCloseTo(-C.cuisine.dislikePenalty);
  });

  it("averages across a place's cuisines rather than summing them", () => {
    // Otherwise a place tagged with six cuisines would beat everything.
    const p = place({ id: "p1", cuisine: ["thai", "local"] });
    const score = cuisineAffinityScore(
      p,
      new Map(),
      prefs({ cuisine_likes: ["thai"] })
    );

    expect(score).toBeCloseTo(C.cuisine.likeBonus / 2);
  });
});

describe("bayesianRatingScore", () => {
  it("pulls a single glowing rating toward the prior", () => {
    const single = place({ id: "p1", avg_rating: 5, visit_count: 1 });
    const many = place({ id: "p2", avg_rating: 4.5, visit_count: 40 });

    // One 5-star review should not outrank forty 4.5-star reviews.
    expect(bayesianRatingScore(many, [])).toBeGreaterThan(
      bayesianRatingScore(single, [])
    );
  });

  it("returns a neutral zero when there are no ratings at all", () => {
    expect(bayesianRatingScore(place({ id: "p1" }), [])).toBe(0);
  });

  it("counts the user's own visits", () => {
    const p = place({ id: "p1" });
    const withMine = bayesianRatingScore(p, [visit("p1", 5)]);

    expect(withMine).toBeGreaterThan(0);
  });
});

describe("budgetFitScore", () => {
  it("scores a place inside the range at full marks", () => {
    const p = place({ id: "p1", budget_tier: 2 });
    expect(budgetFitScore(p, prefs({ budget_min: 1, budget_max: 3 }))).toBe(
      C.budget.inRange
    );
  });

  it("scores one tier outside as a partial fit", () => {
    const p = place({ id: "p1", budget_tier: 4 });
    expect(budgetFitScore(p, prefs({ budget_min: 1, budget_max: 3 }))).toBe(
      C.budget.adjacent
    );
  });

  it("scores far outside at zero", () => {
    const p = place({ id: "p1", budget_tier: 4 });
    expect(budgetFitScore(p, prefs({ budget_min: 1, budget_max: 2 }))).toBe(
      C.budget.outOfRange
    );
  });

  it("treats everything as fitting when no preferences are set", () => {
    expect(budgetFitScore(place({ id: "p1", budget_tier: 4 }), null)).toBe(
      C.budget.inRange
    );
  });

  it("falls back to the new top tier (6), not the old one (4), when a stale prefs row has no budget_max", () => {
    const stalePrefs = prefs({
      budget_max: undefined as unknown as BudgetTier,
    });
    expect(
      budgetFitScore(place({ id: "p1", budget_tier: 6 }), stalePrefs)
    ).toBe(C.budget.inRange);
  });
});

describe("walkPenaltyScore", () => {
  it("charges nothing inside the free window", () => {
    expect(walkPenaltyScore(place({ id: "p1", walk_minutes: 5 }))).toBe(0);
  });

  it("charges per minute beyond the free window", () => {
    const p = place({ id: "p1", walk_minutes: 10 });
    expect(walkPenaltyScore(p)).toBeCloseTo(-5 * C.walk.penaltyPerMinute);
  });

  it("never falls below the floor", () => {
    const p = place({ id: "p1", walk_minutes: 500 });
    expect(walkPenaltyScore(p)).toBe(C.walk.floor);
  });

  it("doubles the penalty when rain is likely", () => {
    const p = place({ id: "p1", walk_minutes: 15 });
    expect(walkPenaltyScore(p, 2)).toBeCloseTo(walkPenaltyScore(p, 1) * 2);
  });
});

describe("varietyBonusScore", () => {
  it("rewards a place you have never been to", () => {
    expect(varietyBonusScore(place({ id: "p1" }), [])).toBe(
      C.variety.explorationBonus
    );
  });

  it("penalises a place you went to yesterday", () => {
    const score = varietyBonusScore(place({ id: "p1" }), [visit("p1", 5, 1)]);
    expect(score).toBe(C.variety.recentPenalty);
  });

  it("decays the penalty as the visit recedes", () => {
    const recent = varietyBonusScore(place({ id: "p1" }), [visit("p1", 5, 5)]);
    const older = varietyBonusScore(place({ id: "p1" }), [visit("p1", 5, 40)]);

    expect(older).toBeGreaterThan(recent);
    expect(older).toBeLessThanOrEqual(0);
  });

  it("halves the penalty over one half-life", () => {
    const atThreshold = varietyBonusScore(place({ id: "p1" }), [
      visit("p1", 5, C.variety.recentDays),
    ]);
    const oneHalfLifeLater = varietyBonusScore(place({ id: "p1" }), [
      visit("p1", 5, C.variety.recentDays + C.variety.halfLifeDays),
    ]);

    expect(oneHalfLifeLater).toBeCloseTo(atThreshold / 2, 1);
  });
});

describe("isExcluded", () => {
  it("excludes a blocked place", () => {
    expect(isExcluded(place({ id: "p1", status: "blocked" }), null)).toBe(true);
  });

  it("excludes a place on the user's blocklist", () => {
    expect(
      isExcluded(place({ id: "p1" }), prefs({ blocklist: ["p1"] }))
    ).toBe(true);
  });

  it("excludes a place whose every cuisine is disliked", () => {
    const p = place({ id: "p1", cuisine: ["thai"] });
    expect(isExcluded(p, prefs({ cuisine_dislikes: ["thai"] }))).toBe(true);
  });

  it("keeps a place that has at least one acceptable cuisine", () => {
    const p = place({ id: "p1", cuisine: ["thai", "local"] });
    expect(isExcluded(p, prefs({ cuisine_dislikes: ["thai"] }))).toBe(false);
  });
});

describe("rankPlaces", () => {
  const places = [
    place({ id: "near", walk_minutes: 3, cuisine: ["japanese"] }),
    place({ id: "far", walk_minutes: 35, cuisine: ["japanese"] }),
    place({ id: "blocked", status: "blocked" }),
    place({ id: "pending", status: "needs_review" }),
  ];

  it("drops blocked and unreviewed places", () => {
    const ids = rankPlaces(places, [], null).map((s) => s.place.id);

    expect(ids).toContain("near");
    expect(ids).not.toContain("blocked");
    expect(ids).not.toContain("pending");
  });

  it("prefers the closer of two otherwise identical places", () => {
    const ranked = rankPlaces(places, [], null);
    const nearIndex = ranked.findIndex((s) => s.place.id === "near");
    const farIndex = ranked.findIndex((s) => s.place.id === "far");

    expect(nearIndex).toBeLessThan(farIndex);
  });

  it("applies the wishlist boost", () => {
    const without = rankPlaces(places, [], null).find(
      (s) => s.place.id === "far"
    )!;
    const with_ = rankPlaces(places, [], null, ["far"]).find(
      (s) => s.place.id === "far"
    )!;

    expect(with_.score - without.score).toBeCloseTo(
      C.boosts.wishlist * C.weights.wishlistBoost
    );
  });

  it("honours the limit", () => {
    expect(rankPlaces(places, [], null, [], { limit: 1 })).toHaveLength(1);
  });

  it("filters by cuisine when asked", () => {
    const mixed = [
      place({ id: "jp", cuisine: ["japanese"] }),
      place({ id: "th", cuisine: ["thai"] }),
    ];
    const ranked = rankPlaces(mixed, [], null, [], { cuisines: ["thai"] });

    expect(ranked.map((s) => s.place.id)).toEqual(["th"]);
  });

  it("excludes anything tiered above budgetMax", () => {
    const mixed = [
      place({ id: "cheap", budget_tier: 1 }),
      place({ id: "pricey", budget_tier: 5 }),
    ];
    const ranked = rankPlaces(mixed, [], null, [], { budgetMax: 2 });

    expect(ranked.map((s) => s.place.id)).toEqual(["cheap"]);
  });

  it("keeps everything when budgetMax is the top tier (a no-op)", () => {
    const mixed = [
      place({ id: "cheap", budget_tier: 1 }),
      place({ id: "pricey", budget_tier: 6 }),
    ];
    const ranked = rankPlaces(mixed, [], null, [], { budgetMax: 6 });

    expect(ranked.map((s) => s.place.id).sort()).toEqual(["cheap", "pricey"]);
  });

  it("excludes anywhere already visited when excludeVisited is set", () => {
    const mixed = [place({ id: "been" }), place({ id: "never" })];
    const visits = [visit("been", 4)];
    const ranked = rankPlaces(mixed, visits, null, [], {
      excludeVisited: true,
    });

    expect(ranked.map((s) => s.place.id)).toEqual(["never"]);
  });

  it("leaves visited places in when excludeVisited is not set", () => {
    const mixed = [place({ id: "been" }), place({ id: "never" })];
    const visits = [visit("been", 4)];
    const ranked = rankPlaces(mixed, visits, null, []);

    expect(ranked.map((s) => s.place.id).sort()).toEqual(["been", "never"]);
  });
});

describe("groupRecommend", () => {
  it("excludes anything a single member has ruled out", () => {
    const places = [
      place({ id: "thai", cuisine: ["thai"] }),
      place({ id: "local", cuisine: ["local"] }),
    ];

    const ranked = groupRecommend(
      [
        { userId: "a", visits: [], prefs: null, wishlistPlaceIds: [] },
        {
          userId: "b",
          visits: [],
          prefs: prefs({ cuisine_dislikes: ["thai"] }),
          wishlistPlaceIds: [],
        },
      ],
      places
    );

    expect(ranked.map((s) => s.place.id)).toEqual(["local"]);
  });

  it("passes excludeVisited/budgetMax through to every member's own ranking", () => {
    const places = [
      place({ id: "beenByA", budget_tier: 1 }),
      place({ id: "pricey", budget_tier: 5 }),
      place({ id: "both-ok" }),
    ];

    const ranked = groupRecommend(
      [
        {
          userId: "a",
          visits: [visit("beenByA", 4)],
          prefs: null,
          wishlistPlaceIds: [],
        },
        { userId: "b", visits: [], prefs: null, wishlistPlaceIds: [] },
      ],
      places,
      { excludeVisited: true, budgetMax: 4 }
    );

    // "beenByA" — a's own visit excludes it for the whole group, same
    // "one person's hard no outranks everyone else's" rule as any other
    // exclusion here. "pricey" is over budgetMax for both members.
    expect(ranked.map((s) => s.place.id)).toEqual(["both-ok"]);
  });

  it("doesn't let the caller's own `limit` shrink the eligibility intersection", () => {
    // A real production report: a group's "Suggested"/"Try:" pool stuck at
    // a couple of places no matter how much a filter was loosened. Root
    // cause — each member's own ranking was truncated to the caller's
    // `limit` *before* the "must survive every member" intersection ran,
    // so a place merely ranked outside one member's own top-N (nothing to
    // do with an actual exclusion) silently dropped out of the group's
    // eligible set entirely, even when it would otherwise have scored well
    // enough for the group as a whole to make the final cut.
    const decoys = Array.from({ length: 3 }, (_, i) =>
      place({ id: `decoy${i}`, cuisine: ["decoy"], budget_tier: 6 })
    );
    const shared = place({ id: "shared", cuisine: ["neutral"], budget_tier: 2 });
    const places = [...decoys, shared];

    const ranked = groupRecommend(
      [
        // Loves "decoy" — outranks "shared" in this member's own personal
        // top-3, without excluding "shared" outright (no dislike, no
        // blocklist entry, just a lower score).
        {
          userId: "a",
          visits: [],
          prefs: prefs({ cuisine_likes: ["decoy"] }),
          wishlistPlaceIds: [],
        },
        // Budget-capped at $$$ — every decoy (tier 6) scores a real
        // out-of-range penalty for this member, while "shared" (tier 2)
        // doesn't, without excluding any decoy outright either.
        {
          userId: "b",
          visits: [],
          prefs: prefs({ budget_min: 1, budget_max: 3 }),
          wishlistPlaceIds: [],
        },
      ],
      places,
      { limit: 3 }
    );

    // "shared" is never excluded by either member, and its group-average
    // score (decent for A, best-in-pool for B) beats at least one decoy's —
    // so it belongs in the final top-3 of these 4 places once eligibility
    // is computed correctly.
    expect(ranked.map((s) => s.place.id)).toContain("shared");
  });

  it("averages the members' scores rather than summing them", () => {
    const places = [place({ id: "p1" })];
    const solo = rankPlaces(places, [], null)[0];
    const group = groupRecommend(
      [
        { userId: "a", visits: [], prefs: null, wishlistPlaceIds: [] },
        { userId: "b", visits: [], prefs: null, wishlistPlaceIds: [] },
      ],
      places
    )[0];

    expect(group.score).toBeCloseTo(solo.score);
  });
});

describe("groupRecommend + surprisePicks composition", () => {
  // /api/suggest's own real bug (not in either function alone): its surprise
  // picks used to be drawn straight from the caller's already limit=8'd
  // `groupRecommend` result — correct for the "Suggested for the group"
  // rail, but the randomizer needs the *entire* eligible set the same way
  // the personal-mode path already re-ranks with `limit: undefined` for
  // exactly this reason. A long-running recurring Jio whose standing list
  // already covers most of a group's top-8 ranked places could then only
  // ever "Try:" whatever was left of that top 8, no matter how many times
  // it rerolled, even with plenty of other eligible places ranked 9th or
  // lower still genuinely available.
  it("a limit=8 group ranking can't reach a genuinely eligible 9th-plus place", () => {
    const places = Array.from({ length: 20 }, (_, i) =>
      place({ id: `p${i}`, walk_minutes: i + 1 })
    );
    const members = [
      { userId: "a", visits: [], prefs: null, wishlistPlaceIds: [] },
    ];

    const limited = groupRecommend(members, places, { limit: 8 });
    const unlimited = groupRecommend(members, places, { limit: undefined });

    expect(limited).toHaveLength(8);
    expect(unlimited).toHaveLength(20);
    // The unlimited ranking can surface a place (walk_minutes-ranked 9th
    // or later) that the limited one structurally never could.
    const limitedIds = new Set(limited.map((s) => s.place.id));
    const onlyInUnlimited = unlimited.filter((s) => !limitedIds.has(s.place.id));
    expect(onlyInUnlimited.length).toBeGreaterThan(0);

    // Simulate almost the whole limited top-8 already being on a
    // long-running recurring Jio's standing list — one place left over.
    const alreadyOnJio = new Set(limited.slice(0, 7).map((s) => s.place.id));
    const surprisesFromLimited = surprisePicks(
      limited.filter((s) => !alreadyOnJio.has(s.place.id)),
      3
    );
    const surprisesFromUnlimited = surprisePicks(
      unlimited.filter((s) => !alreadyOnJio.has(s.place.id)),
      3
    );
    expect(surprisesFromLimited.length).toBeLessThan(3);
    expect(surprisesFromUnlimited).toHaveLength(3);
  });
});

describe("surprisePick", () => {
  it("returns null for an empty ranking", () => {
    expect(surprisePick([])).toBeNull();
  });

  it("draws from the top pool most of the time", () => {
    const ranked = rankPlaces(
      Array.from({ length: 20 }, (_, i) =>
        place({ id: `p${i}`, walk_minutes: i + 1 })
      ),
      [],
      null
    );

    // rand() below the top-probability threshold means "pick from the top N".
    const pick = surprisePick(ranked, () => 0);
    expect(ranked.slice(0, C.surprise.topN)).toContain(pick);
  });
});

describe("surprisePicks", () => {
  it("returns an empty array for an empty ranking", () => {
    expect(surprisePicks([])).toEqual([]);
  });

  it("returns the requested count of distinct places", () => {
    const ranked = rankPlaces(
      Array.from({ length: 20 }, (_, i) =>
        place({ id: `p${i}`, walk_minutes: i + 1 })
      ),
      [],
      null
    );

    const picks = surprisePicks(ranked, 3);
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.place.id)).size).toBe(3);
  });

  it("returns fewer than the requested count once the ranking runs out", () => {
    const ranked = rankPlaces(
      Array.from({ length: 2 }, (_, i) => place({ id: `p${i}` })),
      [],
      null
    );

    expect(surprisePicks(ranked, 3)).toHaveLength(2);
  });
});

describe("whyHint", () => {
  it("explains a close place in terms of the walk", () => {
    const scored = rankPlaces(
      [place({ id: "p1", walk_minutes: 30, cuisine: [] })],
      [],
      null
    )[0];

    expect(typeof whyHint(scored)).toBe("string");
    expect(whyHint(scored).length).toBeGreaterThan(0);
  });
});
