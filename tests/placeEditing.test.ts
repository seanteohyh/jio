import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";

beforeEach(() => {
  resetDemoStore();
});

/**
 * Place editing — the production fix in 027_place_editing.sql and
 * 028_place_edit_attribution.sql.
 *
 * What this cannot prove, stated plainly: demoRepo has no grants and no RLS,
 * so this asserts the repo-layer contract only — that `updatePlace` applies a
 * patch correctly and that `status` cannot ride along in one, since demoRepo
 * has its own guard against that (see the comment in demoRepo.updatePlace).
 * It would not have caught the actual bug, which lived in Postgres: a column
 * grant that never grew to cover columns the edit form later started
 * writing. Catching that class of failure needs a test against a real
 * Supabase instance, which this suite deliberately avoids — every test here
 * runs without a database, which is why the suite takes two seconds. The
 * honest mitigations for the production case are 027's own sanity `select`s
 * and the fact that its grant is derived from information_schema rather than
 * hand-listed. A green run here does not mean editing works in production.
 */
async function seedPlace(createdBy = "somebody-else") {
  return demoRepo.createPlace({
    name: "Kopitiam Test",
    address: "1 Test Street",
    lat: 1.3,
    lng: 103.85,
    cuisine: ["local"],
    custom_cuisine_tags: [],
    budget_tier: 2,
    source: "manual",
    status: "active",
    best_dishes: ["kopi"],
    notes: "original notes",
    created_by: createdBy,
  });
}

describe("updatePlace", () => {
  it("lets a non-creator edit the place", async () => {
    const place = await seedPlace("somebody-else");

    const updated = await demoRepo.updatePlace(place.id, {
      name: "Kopitiam Test (renamed)",
    });

    expect(updated.name).toBe("Kopitiam Test (renamed)");
    // No actor is even threaded through demoRepo.updatePlace — this is the
    // regression test for that: any future ownership check added here would
    // be a change in behaviour, not a bug fix.
  });

  it("changes only the fields it is given and leaves the rest alone", async () => {
    const place = await seedPlace();

    const updated = await demoRepo.updatePlace(place.id, {
      name: "New Name",
    });

    expect(updated.name).toBe("New Name");
    expect(updated.address).toBe("1 Test Street");
    expect(updated.lat).toBe(1.3);
    expect(updated.lng).toBe(103.85);
    expect(updated.cuisine).toEqual(["local"]);
    expect(updated.budget_tier).toBe(2);
    expect(updated.best_dishes).toEqual(["kopi"]);
    expect(updated.notes).toBe("original notes");
  });

  it("round-trips every field the create form collects", async () => {
    const place = await seedPlace();

    const patch = {
      name: "Fully Edited Place",
      address: "2 New Street",
      lat: 1.31,
      lng: 103.86,
      cuisine: ["chinese", "cafe"],
      budget_tier: 3 as const,
      best_dishes: ["chicken rice", "kaya toast"],
      notes: "updated notes",
    };
    const updated = await demoRepo.updatePlace(place.id, patch);

    expect(updated).toMatchObject(patch);
  });

  it("cannot move status through a plain edit", async () => {
    const place = await seedPlace();
    expect(place.status).toBe("active");

    // `status` is not part of the allowed patch type in the API route or in
    // demoRepo's own guard — the cast stands in for a hand-rolled request
    // body that TypeScript never saw, same as the smuggling test in
    // visitEdit.test.ts.
    type Patch = Parameters<typeof demoRepo.updatePlace>[1];
    const smuggled = {
      name: "Still Editable",
      status: "blocked",
    } as unknown as Patch;

    const updated = await demoRepo.updatePlace(place.id, smuggled);

    expect(updated.name).toBe("Still Editable");
    expect(updated.status).toBe("active");
  });

  it("refuses a place that does not exist", async () => {
    await expect(
      demoRepo.updatePlace("no-such-place", { name: "Ghost" })
    ).rejects.toThrow();
  });

  it("stamps updated_at on every edit", async () => {
    const place = await seedPlace();
    const before = place.updated_at;

    await new Promise((resolve) => setTimeout(resolve, 2));
    const updated = await demoRepo.updatePlace(place.id, { name: "Touched" });

    expect(updated.updated_at).not.toBe(before);
  });
});

// Sanity check that the demo user (used throughout the rest of the suite)
// can edit places it did not create, matching "any signed-in user may edit
// any place" — confirmed 1 Aug, see CHANGES_20260801.md.
describe("updatePlace as the demo user", () => {
  it("edits a place created by someone else", async () => {
    const place = await seedPlace("a-different-teammate");
    const updated = await demoRepo.updatePlace(place.id, {
      notes: `edited by ${DEMO_USER_ID}`,
    });
    expect(updated.notes).toBe(`edited by ${DEMO_USER_ID}`);
  });
});
