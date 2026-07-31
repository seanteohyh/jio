import { beforeEach, describe, expect, it } from "vitest";
import { pickCommitteeSuggestions } from "@/lib/suggestCommittee";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";
import type { BudgetTier, MemberData, Place, Visit } from "@/types";

function place(overrides: Partial<Place> & { id: string }): Place {
  return {
    name: overrides.id,
    address: null,
    lat: 1.3,
    lng: 103.85,
    cuisine: ["local"],
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

function visit(placeId: string, userId: string, rating = 4): Visit {
  return {
    id: `${userId}-${placeId}`,
    place_id: placeId,
    user_id: userId,
    rating,
    best_dishes: [],
    notes: null,
    visited_at: new Date().toISOString(),
    is_public: true,
  };
}

function member(userId: string, visits: Visit[] = []): MemberData {
  return { userId, visits, prefs: null, wishlistPlaceIds: [] };
}

describe("pickCommitteeSuggestions", () => {
  const places = [
    place({ id: "a", avg_rating: 4.5, visit_count: 10 }),
    place({ id: "b", avg_rating: 4.0, visit_count: 5 }),
    place({ id: "c", avg_rating: 3.5, visit_count: 3 }),
    place({ id: "d", avg_rating: 5.0, visit_count: 20 }),
  ];

  it("returns 2 personalized picks plus 1 exploratory pick when data supports it", () => {
    // Alice and Bob have both been to "d" — everything else is novel to them.
    const membersData = [
      member("alice", [visit("d", "alice")]),
      member("bob", [visit("d", "bob")]),
    ];

    const picks = pickCommitteeSuggestions(places, membersData, new Set());

    expect(picks.filter((p) => p.kind === "personalized")).toHaveLength(2);
    expect(picks.filter((p) => p.kind === "exploratory")).toHaveLength(1);
  });

  it("never suggests an excluded place", () => {
    const picks = pickCommitteeSuggestions(places, [member("alice")], new Set(["a", "b", "c", "d"]));
    expect(picks).toHaveLength(0);
  });

  it("picks the highest-rated place among those nobody in the group has visited", () => {
    // "magnet" places carry a strong cuisine-affinity signal so they reliably
    // win the 2 personalized slots, leaving a/b/c/d entirely free for the
    // exploratory logic to be tested deterministically.
    const magnets = [
      place({ id: "magnet1", cuisine: ["japanese"] }),
      place({ id: "magnet2", cuisine: ["japanese"] }),
    ];
    const pool = [...magnets, ...places];
    const membersData = [
      {
        userId: "alice",
        // A low rating so alice's visit doesn't create a *positive* learned
        // affinity for "local" cuisine that could out-compete the magnets'
        // explicit like-bonus — this test only cares about the novelty
        // exclusion the visit itself creates, not its rating.
        visits: [visit("d", "alice", 2)],
        prefs: {
          user_id: "alice",
          cuisine_likes: ["japanese"],
          cuisine_dislikes: [],
          budget_min: 1 as BudgetTier,
          budget_max: 4 as BudgetTier,
          blocklist: [],
        },
        wishlistPlaceIds: [],
      },
    ];

    const picks = pickCommitteeSuggestions(pool, membersData, new Set());
    const personalizedIds = picks
      .filter((p) => p.kind === "personalized")
      .map((p) => p.place.id);
    const exploratory = picks.find((p) => p.kind === "exploratory");

    expect(personalizedIds).toEqual(["magnet1", "magnet2"]);
    // Among a/b/c/d, "d" is visited (not novel); the highest-rated of the
    // rest is "a" (avg_rating 4.5).
    expect(exploratory?.place.id).toBe("a");
  });

  it("falls back to least-visited-by-group when the group has visited everywhere", () => {
    const magnets = [
      place({ id: "magnet1", cuisine: ["japanese"] }),
      place({ id: "magnet2", cuisine: ["japanese"] }),
    ];
    const pool = [...magnets, place({ id: "only", avg_rating: 4, visit_count: 5 })];
    const membersData = [
      {
        userId: "alice",
        visits: [visit("only", "alice")],
        prefs: {
          user_id: "alice",
          cuisine_likes: ["japanese"],
          cuisine_dislikes: [],
          budget_min: 1 as BudgetTier,
          budget_max: 4 as BudgetTier,
          blocklist: [],
        },
        wishlistPlaceIds: [],
      },
    ];

    const picks = pickCommitteeSuggestions(pool, membersData, new Set());
    const exploratory = picks.find((p) => p.kind === "exploratory");

    // "only" is the sole non-personalized candidate and it's already
    // visited — nothing is "novel", but the fallback should still surface
    // it rather than coming back empty.
    expect(exploratory?.place.id).toBe("only");
  });

  it("never lets the exploratory pick duplicate a personalized pick", () => {
    const membersData = [member("alice")];
    const picks = pickCommitteeSuggestions(places, membersData, new Set());

    const personalizedIds = new Set(
      picks.filter((p) => p.kind === "personalized").map((p) => p.place.id)
    );
    const exploratory = picks.find((p) => p.kind === "exploratory");

    if (exploratory) {
      expect(personalizedIds.has(exploratory.place.id)).toBe(false);
    }
  });

  it("returns nothing when there are no eligible places at all", () => {
    expect(pickCommitteeSuggestions([], [member("alice")], new Set())).toEqual([]);
  });
});

const TOMORROW = new Date(Date.now() + 86400000).toISOString();

async function makeEvent(options?: {
  kakiId?: string | null;
  inviteeIds?: string[];
  placeIds?: string[];
}) {
  return demoRepo.createEvent(
    DEMO_USER_ID,
    "Test lunch",
    TOMORROW,
    DEFAULT_OFFICE.id,
    options?.placeIds ?? [],
    options?.kakiId ?? null,
    options?.inviteeIds ?? []
  );
}

describe("Repo.suggestOptionsForEvent", () => {
  beforeEach(() => {
    resetDemoStore();
  });

  it("refuses a stranger", async () => {
    const event = await makeEvent();
    await expect(
      demoRepo.suggestOptionsForEvent(event.id, "some-stranger-id")
    ).rejects.toThrow(/host, kaki members or invitees/i);
  });

  it("marks every added option as suggested", async () => {
    const event = await makeEvent({ inviteeIds: [DEMO_TEAMMATE_A] });
    const added = await demoRepo.suggestOptionsForEvent(event.id, DEMO_USER_ID);

    expect(added.length).toBeGreaterThan(0);
    expect(added.every((o) => o.is_suggested)).toBe(true);

    const detail = await demoRepo.getEvent(event.id);
    for (const placeId of added.map((o) => o.place_id)) {
      const option = detail?.options.find((o) => o.place_id === placeId);
      expect(option?.is_suggested).toBe(true);
    }
  });

  it("a re-roll replaces untouched suggestions but keeps ones with a vote", async () => {
    const event = await makeEvent({ inviteeIds: [DEMO_TEAMMATE_A] });
    const first = await demoRepo.suggestOptionsForEvent(event.id, DEMO_USER_ID);
    expect(first.length).toBeGreaterThan(0);

    // Someone votes for the first suggested place — it should survive a re-roll.
    const votedFor = first[0].place_id;
    await demoRepo.castBallot(event.id, DEMO_TEAMMATE_A, [votedFor]);

    const excludeIds = first.map((o) => o.place_id);
    await demoRepo.suggestOptionsForEvent(event.id, DEMO_USER_ID, excludeIds);

    const detail = await demoRepo.getEvent(event.id);
    const stillThere = detail?.options.some((o) => o.place_id === votedFor);
    expect(stillThere).toBe(true);

    // The untouched suggestions (no vote) should not still be marked
    // suggested under their original identity — a fresh set replaced them.
    const untouchedIds = first
      .filter((o) => o.place_id !== votedFor)
      .map((o) => o.place_id);
    for (const placeId of untouchedIds) {
      const stillSuggested = detail?.options.some(
        (o) => o.place_id === placeId && o.is_suggested
      );
      expect(stillSuggested).toBe(false);
    }
  });

  it("respects excludePlaceIds so a re-roll doesn't repeat itself", async () => {
    const event = await makeEvent({ inviteeIds: [DEMO_TEAMMATE_A, DEMO_TEAMMATE_B] });
    const first = await demoRepo.suggestOptionsForEvent(event.id, DEMO_USER_ID);
    const firstIds = first.map((o) => o.place_id);

    const second = await demoRepo.suggestOptionsForEvent(
      event.id,
      DEMO_USER_ID,
      firstIds
    );

    for (const option of second) {
      expect(firstIds).not.toContain(option.place_id);
    }
  });
});
