import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";

const STRANGER = "00000000-0000-0000-0000-0000000stranger";

/**
 * listAllUsers — docs/user-discovery.md §4.1 (server-side filtering, office
 * scoping) and §4.2 (co-attendance ranking). §4.1's filtering moved
 * server-side into the repo, scoped to the caller's office (from their own
 * user_prefs.default_office_id, falling back to the default office) rather
 * than returning the whole team. §4.2 orders and gates the result by three
 * tiers instead of alphabetically — see CHANGES_20260818.md §3.
 */

beforeEach(() => {
  resetDemoStore();
});

describe("listAllUsers — §4.1 filtering and office scoping", () => {
  it("excludes the caller themselves", async () => {
    const users = await demoRepo.listAllUsers(DEMO_USER_ID);
    expect(users.map((u) => u.user_id)).not.toContain(DEMO_USER_ID);
  });

  it("returns demo teammates with no query given (both are Kaki co-members)", async () => {
    const users = await demoRepo.listAllUsers(DEMO_USER_ID);
    expect(users.map((u) => u.user_id)).toContain(DEMO_TEAMMATE_A);
    expect(users.map((u) => u.user_id)).toContain(DEMO_TEAMMATE_B);
  });

  it("filters by display name server-side", async () => {
    const all = await demoRepo.listAllUsers(DEMO_USER_ID);
    const target = all[0];
    const filtered = await demoRepo.listAllUsers(
      DEMO_USER_ID,
      target.display_name.slice(0, 3)
    );
    expect(filtered.some((u) => u.user_id === target.user_id)).toBe(true);
    expect(
      filtered.every((u) =>
        u.display_name
          .toLowerCase()
          .includes(target.display_name.slice(0, 3).toLowerCase())
      )
    ).toBe(true);
  });

  it("scopes to the default office when a user has no preference set", async () => {
    const users = await demoRepo.listAllUsers(
      DEMO_USER_ID,
      undefined,
      DEFAULT_OFFICE.id
    );
    expect(users.map((u) => u.user_id)).toContain(DEMO_TEAMMATE_A);
  });

  it("excludes users scoped to a different office", async () => {
    await demoRepo.upsertUserPrefs({
      user_id: DEMO_TEAMMATE_A,
      cuisine_likes: [],
      cuisine_dislikes: [],
      budget_min: 1,
      budget_max: 4,
      blocklist: [],
      reminders_enabled: true,
      reminder_lead_minutes: 30,
      default_office_id: "some-other-office",
    });

    const users = await demoRepo.listAllUsers(
      DEMO_USER_ID,
      undefined,
      DEFAULT_OFFICE.id
    );
    expect(users.map((u) => u.user_id)).not.toContain(DEMO_TEAMMATE_A);

    const otherOffice = await demoRepo.listAllUsers(
      DEMO_USER_ID,
      "Alex", // a query, since the stranger-office user is tier 3
      "some-other-office"
    );
    expect(otherOffice.map((u) => u.user_id)).toContain(DEMO_TEAMMATE_A);
  });
});

describe("listAllUsers — §4.2 co-attendance ranking", () => {
  it("puts a shared-event participant in tier 1, ranked ahead of a Kaki co-member", async () => {
    // DEMO_TEAMMATE_A and DEMO_TEAMMATE_B are both in DEMO_USER_ID's Kaki
    // (tier 2 by default), but demo-event-past-1 was hosted by DEMO_USER_ID
    // with DEMO_TEAMMATE_A among its invitees/options... use an explicit
    // send instead so this test doesn't depend on exactly which demo event
    // has which invitees.
    await demoRepo.createEvent(
      DEMO_USER_ID,
      "Shared lunch",
      new Date().toISOString(),
      DEFAULT_OFFICE.id,
      ["demo-place-12"],
      undefined,
      [DEMO_TEAMMATE_A]
    );

    const users = await demoRepo.listAllUsers(DEMO_USER_ID);
    const ids = users.map((u) => u.user_id);
    // Tier 1 (shared event) outranks tier 2 (Kaki-only).
    expect(ids.indexOf(DEMO_TEAMMATE_A)).toBeLessThan(ids.indexOf(DEMO_TEAMMATE_B));
  });

  it("hides a tier-3 stranger by default but surfaces them on search", async () => {
    await demoRepo.upsertProfile(STRANGER, "Stranger Danger");

    const noQuery = await demoRepo.listAllUsers(DEMO_USER_ID);
    expect(noQuery.map((u) => u.user_id)).not.toContain(STRANGER);

    const searched = await demoRepo.listAllUsers(DEMO_USER_ID, "Stranger");
    expect(searched.map((u) => u.user_id)).toContain(STRANGER);
  });

  it("force-includes a tier-3 id via includeIds, even with no query", async () => {
    // A multi-select picker's already-picked-but-tier-3 person shouldn't
    // vanish from the result (and lose their resolvable name) just because
    // the search that originally surfaced them was cleared.
    await demoRepo.upsertProfile(STRANGER, "Picked Stranger");

    const withoutInclude = await demoRepo.listAllUsers(DEMO_USER_ID);
    expect(withoutInclude.map((u) => u.user_id)).not.toContain(STRANGER);

    const withInclude = await demoRepo.listAllUsers(
      DEMO_USER_ID,
      undefined,
      undefined,
      [STRANGER]
    );
    expect(withInclude.map((u) => u.user_id)).toContain(STRANGER);
  });

  it("ranks tier 1 by co-attendance score, most recent/frequent first", async () => {
    // Two shared events with DEMO_TEAMMATE_B, one with DEMO_TEAMMATE_A —
    // B should outrank A within tier 1.
    await demoRepo.createEvent(
      DEMO_USER_ID,
      "Lunch 1",
      new Date().toISOString(),
      DEFAULT_OFFICE.id,
      ["demo-place-12"],
      undefined,
      [DEMO_TEAMMATE_A]
    );
    await demoRepo.createEvent(
      DEMO_USER_ID,
      "Lunch 2",
      new Date().toISOString(),
      DEFAULT_OFFICE.id,
      ["demo-place-12"],
      undefined,
      [DEMO_TEAMMATE_B]
    );
    await demoRepo.createEvent(
      DEMO_USER_ID,
      "Lunch 3",
      new Date().toISOString(),
      DEFAULT_OFFICE.id,
      ["demo-place-12"],
      undefined,
      [DEMO_TEAMMATE_B]
    );

    const users = await demoRepo.listAllUsers(DEMO_USER_ID);
    const ids = users.map((u) => u.user_id);
    expect(ids.indexOf(DEMO_TEAMMATE_B)).toBeLessThan(ids.indexOf(DEMO_TEAMMATE_A));
  });

  it("orders tier 2 by Kaki name, ahead of a later-lettered Kaki's co-member", async () => {
    const STRANGER_2 = "00000000-0000-0000-0000-0000000strangr2";
    await demoRepo.upsertProfile(STRANGER, "First Stranger");
    await demoRepo.upsertProfile(STRANGER_2, "Second Stranger");

    const early = await demoRepo.createKaki(DEMO_USER_ID, "AAA Early Kaki");
    const late = await demoRepo.createKaki(DEMO_USER_ID, "ZZZ Late Kaki");
    await demoRepo.addKakiMember(early.id, STRANGER, DEMO_USER_ID);
    await demoRepo.addKakiMember(late.id, STRANGER_2, DEMO_USER_ID);

    const users = await demoRepo.listAllUsers(DEMO_USER_ID);
    const ids = users.map((u) => u.user_id);
    expect(ids.indexOf(STRANGER)).toBeLessThan(ids.indexOf(STRANGER_2));
  });
});
