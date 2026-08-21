import { describe, expect, it } from "vitest";
import { BUDGET_TIERS, budgetLabel } from "@/lib/constants";

describe("BUDGET_TIERS (CHANGES_20260821.md §1)", () => {
  it("splits the old top tier into three, keeping 1-3 unchanged", () => {
    expect(BUDGET_TIERS).toEqual([
      { tier: 1, label: "$", description: "under $8" },
      { tier: 2, label: "$$", description: "$8 – $15" },
      { tier: 3, label: "$$$", description: "$15 – $30" },
      { tier: 4, label: "$$$$", description: "$30 – $50" },
      { tier: 5, label: "$$$$$", description: "$50 – $100" },
      { tier: 6, label: "$$$$$$", description: "over $100" },
    ]);
  });
});

describe("budgetLabel", () => {
  it("no longer caps at 4 dollar signs", () => {
    expect(budgetLabel(5)).toBe("$$$$$");
    expect(budgetLabel(6)).toBe("$$$$$$");
  });

  it("still clamps out-of-range input to the new ceiling", () => {
    expect(budgetLabel(9)).toBe("$$$$$$");
    expect(budgetLabel(0)).toBe("$");
  });
});
