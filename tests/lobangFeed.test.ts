import { describe, expect, it } from "vitest";
import { mergeLobangFeed } from "@/lib/utils";
import type { Lobang } from "@/types";

/**
 * CHANGES_20260816.md §2 — the "browse" lobangs page merges two already-
 * fetched lists (received, sent) into one reverse-chronological feed
 * client-side. No new schema/endpoint, so the only real logic worth
 * testing is this merge-and-sort.
 */
function lobang(overrides: Partial<Lobang> & { id: string; created_at: string }): Lobang {
  return {
    from_user_id: "someone",
    place_id: "demo-place-01",
    ...overrides,
  };
}

describe("mergeLobangFeed", () => {
  it("tags each item with its direction", () => {
    const feed = mergeLobangFeed(
      [lobang({ id: "r1", created_at: "2026-08-01T00:00:00Z" })],
      [lobang({ id: "s1", created_at: "2026-08-02T00:00:00Z" })]
    );

    expect(feed.find((l) => l.id === "r1")?.direction).toBe("received");
    expect(feed.find((l) => l.id === "s1")?.direction).toBe("sent");
  });

  it("sorts newest first across both lists", () => {
    const feed = mergeLobangFeed(
      [
        lobang({ id: "old-received", created_at: "2026-08-01T00:00:00Z" }),
        lobang({ id: "newest", created_at: "2026-08-10T00:00:00Z" }),
      ],
      [lobang({ id: "mid-sent", created_at: "2026-08-05T00:00:00Z" })]
    );

    expect(feed.map((l) => l.id)).toEqual(["newest", "mid-sent", "old-received"]);
  });

  it("handles either list being empty", () => {
    const received = [lobang({ id: "r1", created_at: "2026-08-01T00:00:00Z" })];
    expect(mergeLobangFeed(received, [])).toHaveLength(1);
    expect(mergeLobangFeed([], received)).toHaveLength(1);
    expect(mergeLobangFeed([], [])).toEqual([]);
  });

  it("does not mutate the input arrays", () => {
    const received = [lobang({ id: "r1", created_at: "2026-08-01T00:00:00Z" })];
    const sent = [lobang({ id: "s1", created_at: "2026-08-02T00:00:00Z" })];

    mergeLobangFeed(received, sent);

    expect(received).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect((received[0] as Partial<{ direction: string }>).direction).toBeUndefined();
  });
});
