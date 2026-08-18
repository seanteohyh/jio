"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Button, Field, inputClass } from "@/components/ui";
import { fetcher } from "@/lib/fetcher";
import type { TeamUser } from "@/types";

/**
 * Search-and-add for a Kaki — CHANGES_20260812.md §1. Reuses the same
 * `/api/users` search endpoint `InvitePicker` already proves in production
 * on the Jio-invite flow, trimmed down for this screen's different shape:
 * one pick adds immediately (no batch/submit step), and existing members
 * are excluded outright rather than shown as already-selected.
 *
 * Ranked, not alphabetical — docs/user-discovery.md §4.2. `query` goes to
 * the server so its own tiering applies: people you've shared a Jio with,
 * then your other Kaki co-members, shown even with an empty search; anyone
 * else in the office only once actually searched for. No `includeIds` here
 * unlike `InvitePicker` — a pick here adds immediately rather than sitting
 * selected across further searches, so there's no name to lose.
 */
export default function AddKakiMemberPanel({
  existingMemberIds,
  onAdd,
}: {
  existingMemberIds: string[];
  onAdd: (userId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needle = query.trim();
  const { data } = useSWR<{ users: TeamUser[] }>(
    `/api/users${needle ? `?q=${encodeURIComponent(needle)}` : ""}`,
    fetcher
  );

  const results = useMemo(
    () => (data?.users ?? []).filter((u) => !existingMemberIds.includes(u.user_id)),
    [data, existingMemberIds]
  );

  const add = async (userId: string) => {
    setAddingId(userId);
    setError(null);
    try {
      await onAdd(userId);
      setQuery("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add that person"
      );
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="space-y-2">
      <Field label="Add someone" hint="Search for a teammate already using Jio.">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={inputClass}
          placeholder="Search a name…"
          autoComplete="off"
        />
      </Field>

      {error && <p className="text-ember text-xs">{error}</p>}

      <div className="max-h-48 space-y-1 overflow-y-auto">
        {results.length === 0 && (
          <p className="text-stone text-xs">
            {needle ? `Nobody matching “${query}”.` : "Nobody to suggest yet."}
          </p>
        )}
        {results.map((teammate) => (
          <div
            key={teammate.user_id}
            className="hover:bg-cream flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm"
          >
            <span className="min-w-0 truncate">{teammate.display_name}</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={addingId === teammate.user_id}
              onClick={() => add(teammate.user_id)}
            >
              {addingId === teammate.user_id ? "…" : "Add"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
