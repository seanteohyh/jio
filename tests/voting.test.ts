import { describe, expect, it } from "vitest";
import {
  computeBorda,
  computeWinner,
  firstPlaceCounts,
} from "@/lib/voting";
import type { EventVote } from "@/types";

const EVENT = "event-1";

function ballot(userId: string, ranked: string[]): EventVote[] {
  return ranked.map((placeId, index) => ({
    event_id: EVENT,
    user_id: userId,
    place_id: placeId,
    rank: index + 1,
  }));
}

describe("computeBorda", () => {
  it("gives a full ballot N points for first place down to 1 for last", () => {
    const votes = ballot("alex", ["a", "b", "c"]);
    const points = computeBorda(votes, ["a", "b", "c"]);

    expect(points).toEqual({ a: 3, b: 2, c: 1 });
  });

  it("scales a partial ballot by that voter's own ballot length", () => {
    // Alex ranks two of three options. Their first choice is worth 2, not 3 —
    // ranking fewer options must not buy more influence.
    const points = computeBorda(ballot("alex", ["a", "b"]), ["a", "b", "c"]);

    expect(points).toEqual({ a: 2, b: 1, c: 0 });
  });

  it("ignores votes for places that are not options", () => {
    const votes = ballot("alex", ["a", "ghost", "b"]);
    const points = computeBorda(votes, ["a", "b"]);

    // The ghost vote is dropped before scoring, so this is a 2-long ballot.
    expect(points.a).toBe(2);
    expect(points.b).toBe(1);
    expect(points).not.toHaveProperty("ghost");
  });

  it("adds up across several voters", () => {
    const votes = [
      ...ballot("alex", ["a", "b", "c"]),
      ...ballot("mei", ["b", "a", "c"]),
    ];
    const points = computeBorda(votes, ["a", "b", "c"]);

    expect(points).toEqual({ a: 5, b: 5, c: 2 });
  });
});

describe("firstPlaceCounts", () => {
  it("counts only rank-1 entries", () => {
    const votes = [
      ...ballot("alex", ["a", "b"]),
      ...ballot("mei", ["a", "b"]),
      ...ballot("sam", ["b", "a"]),
    ];

    expect(firstPlaceCounts(votes, ["a", "b"])).toEqual({ a: 2, b: 1 });
  });
});

describe("computeWinner", () => {
  it("picks the highest Borda score", () => {
    const votes = [
      ...ballot("alex", ["a", "b", "c"]),
      ...ballot("mei", ["a", "c", "b"]),
    ];
    const result = computeWinner(votes, ["a", "b", "c"]);

    expect(result.winnerId).toBe("a");
    expect(result.tieBroken).toBe(false);
  });

  it("breaks a points tie on first-place votes", () => {
    // a and b both score 5; a was ranked first twice, b once.
    const votes = [
      ...ballot("alex", ["a", "b", "c"]),
      ...ballot("mei", ["b", "a", "c"]),
      ...ballot("sam", ["a", "c", "b"]),
      ...ballot("kim", ["b", "c", "a"]),
    ];
    const points = computeBorda(votes, ["a", "b", "c"]);
    expect(points.a).toBe(points.b);

    const result = computeWinner(votes, ["a", "b", "c"]);
    expect(["a", "b"]).toContain(result.winnerId);
    expect(result.tieBroken).toBe(true);
  });

  it("falls back to the injected random source on a double tie", () => {
    // Perfectly symmetric: same points, same first-place counts.
    const votes = [...ballot("alex", ["a", "b"]), ...ballot("mei", ["b", "a"])];

    const first = computeWinner(votes, ["a", "b"], () => 0);
    const second = computeWinner(votes, ["a", "b"], () => 0.99);

    expect(first.tieBroken).toBe(true);
    expect(first.winnerId).toBe("a");
    expect(second.winnerId).toBe("b");
  });

  it("returns a null winner when nobody voted", () => {
    const result = computeWinner([], ["a", "b"]);

    expect(result.winnerId).toBeNull();
    expect(result.points).toBe(0);
  });

  it("returns a null winner when there are no options", () => {
    expect(computeWinner(ballot("alex", ["a"]), []).winnerId).toBeNull();
  });

  it("handles a mix of full and partial ballots", () => {
    const votes = [
      ...ballot("alex", ["a", "b", "c"]), // a=3 b=2 c=1
      ...ballot("mei", ["c"]), //            c=1
      ...ballot("sam", ["b", "c"]), //       b=2 c=1
    ];
    const result = computeWinner(votes, ["a", "b", "c"]);

    // b totals 4, c totals 3, a totals 3.
    expect(result.winnerId).toBe("b");
    expect(result.points).toBe(4);
  });
});
