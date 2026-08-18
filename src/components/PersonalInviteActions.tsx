"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button, Card, LinkButton, inputClass } from "@/components/ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import type { Kaki } from "@/types";

/**
 * The two actions a personal invite link (`/u/[token]`) offers a signed-in
 * visitor — CHANGES_20260818.md §3 / docs/user-discovery.md §4.3.
 * Deliberately not "add as friend": no edge is created just by viewing the
 * link, only by actually taking one of these two actions.
 */
export default function PersonalInviteActions({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const { data } = useSWR<{ kakis: Kaki[] }>("/api/kakis", fetcher);
  const kakis = data?.kakis ?? [];

  const [kakiId, setKakiId] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addToKaki = async () => {
    if (!kakiId) return;
    setBusy(true);
    setError(null);
    try {
      await mutateJson(`/api/kakis/${kakiId}/members`, "POST", {
        user_id: userId,
      });
      setAdded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add them");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <LinkButton href={`/events/new?invite=${userId}`} className="w-full">
        Start a Jio with {displayName}
      </LinkButton>

      {kakis.length > 0 && (
        <Card className="space-y-2">
          <p className="text-ink text-sm font-medium">
            Add {displayName} to a Kaki
          </p>
          {added ? (
            <p className="text-sage text-sm">Added ✓</p>
          ) : (
            <div className="flex gap-2">
              <select
                value={kakiId}
                onChange={(e) => setKakiId(e.target.value)}
                className={inputClass}
              >
                <option value="">Pick a Kaki</option>
                {kakis.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={!kakiId || busy} onClick={addToKaki}>
                {busy ? "…" : "Add"}
              </Button>
            </div>
          )}
          {error && <p className="text-ember text-xs">{error}</p>}
        </Card>
      )}
    </div>
  );
}
