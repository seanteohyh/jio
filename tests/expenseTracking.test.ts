import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A } from "@/lib/data/demoData";
import { centsToBudgetTier, previousMonthKey } from "@/lib/expenses";

beforeEach(() => {
  resetDemoStore();
});

describe("expense ledger", () => {
  it("logs an entry, defaulting logged_at to today when not given", async () => {
    const entry = await demoRepo.createExpenseEntry(DEMO_USER_ID, {
      amountCents: 1250,
      label: "Yakun kaya toast",
      category: "coffee",
    });

    expect(entry.amount_cents).toBe(1250);
    expect(entry.category).toBe("coffee");
    expect(entry.logged_at).toBeTruthy();
    expect(entry.place_id ?? null).toBeNull();
  });

  it("lists only the calling user's entries for the given month, newest first", async () => {
    await demoRepo.createExpenseEntry(DEMO_USER_ID, {
      amountCents: 500,
      label: "Coffee",
      category: "coffee",
      loggedAt: "2026-08-01",
    });
    await demoRepo.createExpenseEntry(DEMO_USER_ID, {
      amountCents: 1200,
      label: "Lunch",
      category: "lunch",
      loggedAt: "2026-08-15",
    });
    await demoRepo.createExpenseEntry(DEMO_TEAMMATE_A, {
      amountCents: 900,
      label: "Someone else's lunch",
      category: "lunch",
      loggedAt: "2026-08-15",
    });
    // Different month — shouldn't show up in the August page.
    await demoRepo.createExpenseEntry(DEMO_USER_ID, {
      amountCents: 700,
      label: "July snack",
      category: "snack",
      loggedAt: "2026-07-20",
    });

    const { entries, totalCount } = await demoRepo.listExpenseEntries(
      DEMO_USER_ID,
      "2026-08",
      1,
      20
    );

    expect(totalCount).toBe(2);
    expect(entries.map((e) => e.label)).toEqual(["Lunch", "Coffee"]);
  });

  it("paginates — 20 per page, second page picks up where the first left off", async () => {
    for (let i = 0; i < 25; i++) {
      await demoRepo.createExpenseEntry(DEMO_USER_ID, {
        amountCents: 100 + i,
        label: `Entry ${i}`,
        category: "snack",
        loggedAt: `2026-08-${String((i % 27) + 1).padStart(2, "0")}`,
      });
    }

    const page1 = await demoRepo.listExpenseEntries(DEMO_USER_ID, "2026-08", 1, 20);
    const page2 = await demoRepo.listExpenseEntries(DEMO_USER_ID, "2026-08", 2, 20);

    expect(page1.totalCount).toBe(25);
    expect(page1.entries).toHaveLength(20);
    expect(page2.entries).toHaveLength(5);
    // No overlap between the two pages.
    const page1Ids = new Set(page1.entries.map((e) => e.id));
    expect(page2.entries.every((e) => !page1Ids.has(e.id))).toBe(true);
  });

  it("amends an entry — edit, not just delete-and-re-add", async () => {
    const entry = await demoRepo.createExpenseEntry(DEMO_USER_ID, {
      amountCents: 500,
      label: "Kopi",
      category: "coffee",
      loggedAt: "2026-08-01",
    });

    const updated = await demoRepo.updateExpenseEntry(DEMO_USER_ID, entry.id, {
      amountCents: 550,
      category: "snack",
    });

    expect(updated.amount_cents).toBe(550);
    expect(updated.category).toBe("snack");
    expect(updated.label).toBe("Kopi"); // untouched field stays as-is
  });

  it.each(["breakfast", "lunch", "dinner", "coffee", "snack", "other"] as const)(
    "accepts %s as a category",
    async (category) => {
      const entry = await demoRepo.createExpenseEntry(DEMO_USER_ID, {
        amountCents: 500,
        label: "Something",
        category,
      });
      expect(entry.category).toBe(category);
    }
  );

  it("links a place match found while editing, and can clear one back off", async () => {
    const entry = await demoRepo.createExpenseEntry(DEMO_USER_ID, {
      amountCents: 800,
      label: "Bo Chung banh mi",
      category: "lunch",
    });
    expect(entry.place_id ?? null).toBeNull();

    const linked = await demoRepo.updateExpenseEntry(DEMO_USER_ID, entry.id, {
      placeId: "demo-place-01",
    });
    expect(linked.place_id).toBe("demo-place-01");

    const unlinked = await demoRepo.updateExpenseEntry(DEMO_USER_ID, entry.id, {
      placeId: null,
    });
    expect(unlinked.place_id ?? null).toBeNull();
  });

  it("hydrates place_name once an entry is created with a matched place", async () => {
    const entry = await demoRepo.createExpenseEntry(DEMO_USER_ID, {
      amountCents: 800,
      label: "Ichiban Boshi",
      category: "lunch",
      placeId: "demo-place-01",
      loggedAt: "2026-08-05",
    });

    const { entries } = await demoRepo.listExpenseEntries(DEMO_USER_ID, "2026-08", 1, 20);
    const found = entries.find((e) => e.id === entry.id);
    expect(found?.place_name).toBeTruthy();
  });

  it("refuses to edit or delete someone else's entry", async () => {
    const entry = await demoRepo.createExpenseEntry(DEMO_USER_ID, {
      amountCents: 500,
      label: "Kopi",
      category: "coffee",
    });

    await expect(
      demoRepo.updateExpenseEntry(DEMO_TEAMMATE_A, entry.id, { amountCents: 100 })
    ).rejects.toThrow(/not yours/i);
    await expect(
      demoRepo.deleteExpenseEntry(DEMO_TEAMMATE_A, entry.id)
    ).rejects.toThrow(/not yours/i);
  });

  it("deletes an entry", async () => {
    const entry = await demoRepo.createExpenseEntry(DEMO_USER_ID, {
      amountCents: 500,
      label: "Kopi",
      category: "coffee",
    });

    await demoRepo.deleteExpenseEntry(DEMO_USER_ID, entry.id);

    const { entries } = await demoRepo.listExpenseEntries(
      DEMO_USER_ID,
      entry.logged_at.slice(0, 7),
      1,
      20
    );
    expect(entries.map((e) => e.id)).not.toContain(entry.id);
  });

  it("survives its source visit being deleted — unlinked, not removed (confirmed: SET NULL, not cascade)", async () => {
    const visit = await demoRepo.createVisit({
      place_id: "demo-place-01",
      user_id: DEMO_USER_ID,
      rating: 4,
      best_dishes: [],
      notes: null,
      visited_at: "2026-08-10",
      is_public: true,
    });
    const entry = await demoRepo.createExpenseEntry(DEMO_USER_ID, {
      amountCents: 1500,
      label: "Some place",
      category: "lunch",
      sourceVisitId: visit.id,
      loggedAt: "2026-08-10",
    });

    await demoRepo.deleteVisit(visit.id, DEMO_USER_ID);

    const { entries } = await demoRepo.listExpenseEntries(DEMO_USER_ID, "2026-08", 1, 20);
    const survived = entries.find((e) => e.id === entry.id);
    expect(survived).toBeTruthy();
    expect(survived?.source_visit_id ?? null).toBeNull();
  });

  describe("getExpenseMonthSummary", () => {
    it("totals by category for the given month", async () => {
      await demoRepo.createExpenseEntry(DEMO_USER_ID, {
        amountCents: 1200,
        label: "Lunch",
        category: "lunch",
        loggedAt: "2026-08-05",
      });
      await demoRepo.createExpenseEntry(DEMO_USER_ID, {
        amountCents: 500,
        label: "Coffee",
        category: "coffee",
        loggedAt: "2026-08-05",
      });

      const summary = await demoRepo.getExpenseMonthSummary(DEMO_USER_ID, "2026-08");

      expect(summary.totalCents).toBe(1700);
      expect(summary.byCategory.lunch).toBe(1200);
      expect(summary.byCategory.coffee).toBe(500);
      expect(summary.byCategory.snack).toBe(0);
    });

    it("computes a delta against the previous month, null with nothing to compare", async () => {
      const prevMonth = previousMonthKey("2026-08");
      expect(prevMonth).toBe("2026-07");

      await demoRepo.createExpenseEntry(DEMO_USER_ID, {
        amountCents: 1000,
        label: "July lunch",
        category: "lunch",
        loggedAt: "2026-07-15",
      });

      const noComparison = await demoRepo.getExpenseMonthSummary(
        DEMO_USER_ID,
        "2026-07"
      );
      expect(noComparison.deltaVsPreviousMonthPct).toBeNull();

      await demoRepo.createExpenseEntry(DEMO_USER_ID, {
        amountCents: 1500,
        label: "August lunch",
        category: "lunch",
        loggedAt: "2026-08-15",
      });

      const withComparison = await demoRepo.getExpenseMonthSummary(
        DEMO_USER_ID,
        "2026-08"
      );
      expect(withComparison.deltaVsPreviousMonthPct).toBe(50);
    });

    it("rolls the year back at January", () => {
      expect(previousMonthKey("2026-01")).toBe("2025-12");
    });

    it("returns a null comparisonNote with no entries this month", async () => {
      const summary = await demoRepo.getExpenseMonthSummary(DEMO_USER_ID, "2026-08");
      expect(summary.comparisonNote).toBeNull();
    });

    it("writes a comparisonNote against the user's own budget preference", async () => {
      await demoRepo.upsertUserPrefs({
        user_id: DEMO_USER_ID,
        cuisine_likes: [],
        cuisine_dislikes: [],
        budget_min: 2,
        budget_max: 3,
        blocklist: [],
        reminders_enabled: true,
        reminder_lead_minutes: 30,
      });
      // $12 lands in tier 3 ($8-15 is tier 2... use a clearly-out-of-range
      // amount instead so the assertion isn't sensitive to band edges).
      await demoRepo.createExpenseEntry(DEMO_USER_ID, {
        amountCents: 12000, // $120 -> tier 6, well above a 2-3 preference
        label: "Splurge",
        category: "lunch",
        loggedAt: "2026-08-05",
      });

      const summary = await demoRepo.getExpenseMonthSummary(DEMO_USER_ID, "2026-08");
      expect(summary.comparisonNote).toMatch(/above/i);
    });
  });

  describe("centsToBudgetTier", () => {
    it.each([
      [500, 1],
      [1000, 2],
      [2000, 3],
      [4000, 4],
      [8000, 5],
      [15000, 6],
    ])("maps %i cents to tier %i", (cents, tier) => {
      expect(centsToBudgetTier(cents)).toBe(tier);
    });
  });
});
