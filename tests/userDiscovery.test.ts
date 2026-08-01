import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

/**
 * listAllUsers filtering and office scoping — docs/user-discovery.md §4.1.
 * Filtering moved server-side into the repo, and results are scoped to the
 * caller's office (from their own user_prefs.default_office_id, falling
 * back to the default office) rather than returning the whole team.
 */

beforeEach(() => {
  resetDemoStore();
});

describe("listAllUsers", () => {
  it("returns everyone with no query or office given", async () => {
    const users = await demoRepo.listAllUsers();
    expect(users.map((u) => u.user_id)).toContain(DEMO_TEAMMATE_A);
    expect(users.map((u) => u.user_id)).toContain(DEMO_TEAMMATE_B);
  });

  it("filters by display name server-side", async () => {
    const all = await demoRepo.listAllUsers();
    const target = all[0];
    const filtered = await demoRepo.listAllUsers(
      target.display_name.slice(0, 3)
    );
    expect(filtered.some((u) => u.user_id === target.user_id)).toBe(true);
    expect(
      filtered.every((u) =>
        u.display_name.toLowerCase().includes(target.display_name.slice(0, 3).toLowerCase())
      )
    ).toBe(true);
  });

  it("scopes to the default office when a user has no preference set", async () => {
    const users = await demoRepo.listAllUsers(undefined, DEFAULT_OFFICE.id);
    // Nobody in the demo data has picked a different office, so scoping to
    // the default office should still include everyone.
    expect(users.map((u) => u.user_id)).toContain(DEMO_USER_ID);
  });

  it("excludes users scoped to a different office", async () => {
    await demoRepo.upsertUserPrefs({
      user_id: DEMO_TEAMMATE_A,
      cuisine_likes: [],
      cuisine_dislikes: [],
      budget_min: 1,
      budget_max: 4,
      blocklist: [],
      default_office_id: "some-other-office",
    });

    const users = await demoRepo.listAllUsers(undefined, DEFAULT_OFFICE.id);
    expect(users.map((u) => u.user_id)).not.toContain(DEMO_TEAMMATE_A);

    const otherOffice = await demoRepo.listAllUsers(
      undefined,
      "some-other-office"
    );
    expect(otherOffice.map((u) => u.user_id)).toEqual([DEMO_TEAMMATE_A]);
  });
});
