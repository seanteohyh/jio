import { describe, expect, it } from "vitest";
import { cycleCuisinePreference } from "@/lib/utils";

/**
 * CHANGES_20260816.md §3 — the profile page's cuisine chips became one
 * 3-state control per cuisine (neutral -> like -> dislike -> neutral)
 * instead of two independent like/dislike grids.
 */
describe("cycleCuisinePreference", () => {
  it("neutral -> like", () => {
    const next = cycleCuisinePreference("thai", [], []);
    expect(next).toEqual({ likes: ["thai"], dislikes: [] });
  });

  it("like -> dislike", () => {
    const next = cycleCuisinePreference("thai", ["thai"], []);
    expect(next).toEqual({ likes: [], dislikes: ["thai"] });
  });

  it("dislike -> neutral", () => {
    const next = cycleCuisinePreference("thai", [], ["thai"]);
    expect(next).toEqual({ likes: [], dislikes: [] });
  });

  it("a full neutral -> like -> dislike -> neutral cycle returns to the start", () => {
    let state = { likes: [] as string[], dislikes: [] as string[] };
    for (let i = 0; i < 3; i++) {
      state = cycleCuisinePreference("thai", state.likes, state.dislikes);
    }
    expect(state).toEqual({ likes: [], dislikes: [] });
  });

  it("leaves other cuisines untouched", () => {
    const next = cycleCuisinePreference("thai", ["japanese", "thai"], ["korean"]);
    expect(next).toEqual({
      likes: ["japanese"],
      dislikes: ["korean", "thai"],
    });
  });

  it("does not mutate the input arrays", () => {
    const likes = ["thai"];
    const dislikes: string[] = [];
    cycleCuisinePreference("thai", likes, dislikes);
    expect(likes).toEqual(["thai"]);
    expect(dislikes).toEqual([]);
  });
});
