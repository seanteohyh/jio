import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A } from "@/lib/data/demoData";

/**
 * UX review log #17 — "Report a problem," a general (non-place) report
 * reached from Profile. A separate table/repo path from `PlaceFlag`
 * rather than a widened one — see GeneralReport's own doc comment in
 * types/index.ts for why — so this gets its own small coverage rather
 * than extending placeFlags.test.ts.
 */
describe("general reports", () => {
  beforeEach(() => {
    resetDemoStore();
  });

  it("lands as a fresh pending report", async () => {
    const report = await demoRepo.createGeneralReport(
      DEMO_TEAMMATE_A,
      "not_working",
      "The vote button did nothing"
    );
    expect(report.status).toBe("pending");
    expect(report.category).toBe("not_working");
    expect(report.reported_by_name).toBeTruthy();
  });

  it("surfaces in the pending queue, oldest first", async () => {
    await demoRepo.createGeneralReport(DEMO_TEAMMATE_A, "other", "First");
    await demoRepo.createGeneralReport(DEMO_USER_ID, "place_wrong", "Second");

    const pending = await demoRepo.listPendingGeneralReports();
    expect(pending).toHaveLength(2);
    expect(pending[0].comment).toBe("First");
    expect(pending[1].comment).toBe("Second");
  });

  it("lets an admin resolve one report without touching the others", async () => {
    const a = await demoRepo.createGeneralReport(DEMO_TEAMMATE_A, "other");
    const b = await demoRepo.createGeneralReport(DEMO_USER_ID, "not_working");

    await demoRepo.resolveGeneralReport(DEMO_USER_ID, a.id);

    const pending = await demoRepo.listPendingGeneralReports();
    expect(pending.map((r) => r.id)).toEqual([b.id]);
  });

  it("refuses anyone but an admin", async () => {
    const report = await demoRepo.createGeneralReport(DEMO_USER_ID, "other");
    await expect(
      demoRepo.resolveGeneralReport(DEMO_TEAMMATE_A, report.id)
    ).rejects.toThrow(/admin/i);
  });
});
