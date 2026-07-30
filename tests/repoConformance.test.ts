import { beforeEach, describe, expect, it } from "vitest";
import { REPO_METHODS } from "@/lib/data";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";

/**
 * Keeps the two Repo implementations honest about each other.
 *
 * A partially-ported repo is the worst kind of bug here: the app works right
 * up until someone hits the one page backed by the method nobody implemented.
 * Comparing shape rather than behaviour lets this run without a database.
 */

beforeEach(() => {
  resetDemoStore();
});

describe("repo conformance", () => {
  it("demoRepo implements every method on the interface", () => {
    for (const method of REPO_METHODS) {
      expect(
        typeof (demoRepo as unknown as Record<string, unknown>)[method],
        `demoRepo is missing ${method}`
      ).toBe("function");
    }
  });

  it("demoRepo exposes no methods the interface does not declare", () => {
    const declared = new Set<string>(REPO_METHODS);
    const actual = Object.keys(demoRepo);

    for (const method of actual) {
      expect(declared.has(method), `${method} is not in REPO_METHODS`).toBe(
        true
      );
    }
  });

  it("supabaseRepo matches demoRepo method for method", async () => {
    // Importing is enough: the module builds its client lazily, per call.
    const { supabaseRepo } = await import("@/lib/data/supabaseRepo");

    expect(Object.keys(supabaseRepo).sort()).toEqual(
      Object.keys(demoRepo).sort()
    );
  });

  it("supabaseRepo declares the same arity as demoRepo for each method", async () => {
    const { supabaseRepo } = await import("@/lib/data/supabaseRepo");

    for (const method of REPO_METHODS) {
      const demoFn = (demoRepo as unknown as Record<string, () => void>)[method];
      const supaFn = (supabaseRepo as unknown as Record<string, () => void>)[
        method
      ];

      expect(supaFn.length, `${method} arity differs`).toBe(demoFn.length);
    }
  });
});

describe("demoRepo behaviour", () => {
  it("scopes the walk cache to the office you asked about", async () => {
    await demoRepo.upsertWalkCache([
      {
        office_id: DEFAULT_OFFICE.id,
        place_id: "demo-place-01",
        walk_minutes: 7,
        distance_m: 560,
      },
      {
        office_id: "other-office",
        place_id: "demo-place-01",
        walk_minutes: 40,
        distance_m: 3200,
      },
    ]);

    const cached = await demoRepo.getWalkCache(DEFAULT_OFFICE.id);

    expect(cached).toHaveLength(1);
    expect(cached[0].walk_minutes).toBe(7);
  });

  it("scopes preferences to a single user", async () => {
    const mine = await demoRepo.getUserPrefs(DEMO_USER_ID);
    const nobody = await demoRepo.getUserPrefs("someone-else");

    expect(mine?.user_id).toBe(DEMO_USER_ID);
    expect(nobody).toBeNull();
  });

  it("enriches places with a walk time and rating aggregate", async () => {
    const places = await demoRepo.listPlaces({ status: "active" });

    expect(places.length).toBeGreaterThan(0);
    expect(typeof places[0].walk_minutes).toBe("number");
    expect(places[0]).toHaveProperty("visit_count");
  });

  it("returns places nearest first", async () => {
    const places = await demoRepo.listPlaces({ status: "active" });
    const walks = places.map((p) => p.walk_minutes ?? 0);

    expect(walks).toEqual([...walks].sort((a, b) => a - b));
  });

  it("keeps unreviewed places out of the default listing", async () => {
    const active = await demoRepo.listPlaces({ status: "active" });
    const pending = await demoRepo.listPlaces({ status: "needs_review" });

    expect(pending.length).toBeGreaterThan(0);
    expect(active.every((p) => p.status === "active")).toBe(true);
  });
});
