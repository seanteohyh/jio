import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";
import { DEMO_KAKI_ID } from "@/lib/data/demoData";
import type { FoodIdentityCard, KakiFoodIdentityCard } from "@/types";

beforeEach(() => {
  resetDemoStore();
});

const CARD: FoodIdentityCard = {
  archetype: "loyalist",
  headline: "The Loyalist",
  description: "Japanese is basically home turf.",
};

describe("listAllUserIds / listAllKakiIds", () => {
  it("lists every seeded profile and Kaki", async () => {
    const userIds = await demoRepo.listAllUserIds();
    expect(userIds).toContain(DEMO_USER_ID);

    const kakiIds = await demoRepo.listAllKakiIds();
    expect(kakiIds).toContain(DEMO_KAKI_ID);
  });
});

/**
 * The cron's own bulk reads — added alongside a live-Supabase bug fix: the
 * per-request `listVisits`/`listPlaces`/`getKaki` calls the cron used to
 * make are gated `authenticated`-only by RLS, and a Vercel Cron invocation
 * has no session at all, so those reads silently returned nothing against
 * a real Supabase project (every snapshot came out `just_getting_started`
 * regardless of real visit history). demoRepo has no RLS to reproduce
 * that failure mode, so these only verify the demo-mode data shape is
 * correct — they cannot exercise the bug itself, which was specific to
 * supabaseRepo's live-mode auth.
 */
describe("listAllVisitsForCron / listAllPlacesForCron / listAllKakisForCron", () => {
  it("returns every visit, across every account", async () => {
    const visits = await demoRepo.listAllVisitsForCron();
    expect(visits.length).toBeGreaterThan(0);
    expect(visits.some((v) => v.user_id === DEMO_USER_ID)).toBe(true);
  });

  it("returns every place", async () => {
    const places = await demoRepo.listAllPlacesForCron();
    expect(places.length).toBeGreaterThan(0);
  });

  it("returns every Kaki with its member ids", async () => {
    const kakis = await demoRepo.listAllKakisForCron();
    const seeded = kakis.find((k) => k.id === DEMO_KAKI_ID);
    expect(seeded).toBeDefined();
    expect(seeded?.memberIds.length).toBeGreaterThan(0);
    expect(seeded?.name).toBeTruthy();
  });
});

describe("user food identity snapshots", () => {
  it("saves and lists a snapshot for a given month", async () => {
    await demoRepo.saveUserFoodIdentitySnapshot(DEMO_USER_ID, "2026-07", CARD);

    const snapshots = await demoRepo.listUserFoodIdentitySnapshots(DEMO_USER_ID);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ month: "2026-07", ...CARD });
  });

  it("upserts rather than duplicating when saved twice for the same month", async () => {
    await demoRepo.saveUserFoodIdentitySnapshot(DEMO_USER_ID, "2026-07", CARD);
    await demoRepo.saveUserFoodIdentitySnapshot(DEMO_USER_ID, "2026-07", {
      ...CARD,
      headline: "The Explorer",
      archetype: "explorer",
    });

    const snapshots = await demoRepo.listUserFoodIdentitySnapshots(DEMO_USER_ID);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].headline).toBe("The Explorer");
  });

  it("keeps prior months browsable, most recent first", async () => {
    await demoRepo.saveUserFoodIdentitySnapshot(DEMO_USER_ID, "2026-06", CARD);
    await demoRepo.saveUserFoodIdentitySnapshot(DEMO_USER_ID, "2026-07", CARD);

    const snapshots = await demoRepo.listUserFoodIdentitySnapshots(DEMO_USER_ID);
    expect(snapshots.map((s) => s.month)).toEqual(["2026-07", "2026-06"]);
  });

  it("keeps snapshots scoped to their own account", async () => {
    await demoRepo.saveUserFoodIdentitySnapshot(DEMO_USER_ID, "2026-07", CARD);
    const other = await demoRepo.listUserFoodIdentitySnapshots("someone-else");
    expect(other).toEqual([]);
  });
});

const KAKI_CARD: KakiFoodIdentityCard = {
  headline: "Mostly Japanese, $$ a meal",
  description: "3 places tried together across 5 visits.",
  mostActive: { user_id: DEMO_USER_ID, visits: 3 },
  adventurer: { user_id: DEMO_USER_ID, distinctPlaces: 2 },
};

describe("kaki food identity snapshots", () => {
  it("saves and lists a snapshot for a given month", async () => {
    await demoRepo.saveKakiFoodIdentitySnapshot(DEMO_KAKI_ID, "2026-07", KAKI_CARD);

    const snapshots = await demoRepo.listKakiFoodIdentitySnapshots(DEMO_KAKI_ID);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ month: "2026-07", ...KAKI_CARD });
  });

  it("upserts rather than duplicating when saved twice for the same month", async () => {
    await demoRepo.saveKakiFoodIdentitySnapshot(DEMO_KAKI_ID, "2026-07", KAKI_CARD);
    await demoRepo.saveKakiFoodIdentitySnapshot(DEMO_KAKI_ID, "2026-07", {
      ...KAKI_CARD,
      headline: "Mostly Thai, $$$ a meal",
    });

    const snapshots = await demoRepo.listKakiFoodIdentitySnapshots(DEMO_KAKI_ID);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].headline).toBe("Mostly Thai, $$$ a meal");
  });
});
