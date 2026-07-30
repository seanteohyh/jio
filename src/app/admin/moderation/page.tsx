"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  SectionHeading,
  Spinner,
  inputClass,
} from "@/components/ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/utils";
import type { AuthUser, ModerationLogEntry, Place, TeamUser } from "@/types";

interface MeResponse {
  user: (AuthUser & { is_admin: boolean }) | null;
}

type StatusFilter = "blocked" | "needs_review" | "active" | "all";

/**
 * Admin-only. Doubles as the "who added what" directory from the lobang
 * change and the block/unblock moderation view from the admin change — one
 * screen, filterable by creator and status, rather than two.
 *
 * Real enforcement is server-side: /api/admin/moderation-log 403s a
 * non-admin regardless of what this page renders, and in live mode RLS
 * would refuse the query underneath that anyway. The is_admin check here
 * just avoids flashing admin controls at someone who can't use them.
 */
export default function ModerationPage() {
  const { data: me, isLoading: meLoading } = useSWR<MeResponse>(
    "/api/me",
    fetcher
  );
  const isAdmin = me?.user?.is_admin ?? false;

  const { data: placesData, mutate: mutatePlaces } = useSWR<{
    places: Place[];
  }>(isAdmin ? "/api/places?status=all" : null, fetcher);
  const { data: logData } = useSWR<{ log: ModerationLogEntry[] }>(
    isAdmin ? "/api/admin/moderation-log?limit=200" : null,
    fetcher
  );
  const { data: usersData } = useSWR<{ users: TeamUser[] }>(
    isAdmin ? "/api/users" : null,
    fetcher
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("blocked");
  const [creatorFilter, setCreatorFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of usersData?.users ?? []) map.set(u.user_id, u.display_name);
    return map;
  }, [usersData]);

  // The log is already newest-first, so the first entry seen per place is
  // its most recent block/unblock.
  const lastActionByPlace = useMemo(() => {
    const map = new Map<string, ModerationLogEntry>();
    for (const entry of logData?.log ?? []) {
      if (!map.has(entry.place_id)) map.set(entry.place_id, entry);
    }
    return map;
  }, [logData]);

  if (meLoading) return <Spinner label="Loading" />;
  if (!me?.user) return null;

  if (!isAdmin) {
    return (
      <EmptyState
        title="Admins only"
        description="This view is restricted to Jio admins."
      />
    );
  }

  const unblock = async (placeId: string) => {
    setBusyId(placeId);
    setError(null);
    try {
      await mutateJson(`/api/places/${placeId}/unblock`, "POST");
      mutatePlaces();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not restore that place"
      );
    } finally {
      setBusyId(null);
    }
  };

  const places = placesData?.places ?? [];
  const filtered = places.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (creatorFilter && p.created_by !== creatorFilter) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Moderation</h1>
        <p className="text-dolch-muted mt-1 text-sm">
          Every place, who added it, and the block/unblock history.
        </p>
      </header>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as StatusFilter)
          }
          className={inputClass}
        >
          <option value="blocked">Blocked</option>
          <option value="needs_review">Needs review</option>
          <option value="active">Active</option>
          <option value="all">All statuses</option>
        </select>
        <select
          value={creatorFilter}
          onChange={(e) => setCreatorFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">Everyone</option>
          {(usersData?.users ?? []).map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.display_name}
            </option>
          ))}
        </select>
      </Card>

      {!placesData ? (
        <Spinner label="Loading places" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description="No places match this filter."
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((place) => {
            const lastAction = lastActionByPlace.get(place.id);
            return (
              <li key={place.id}>
                <Card className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/places/${place.id}`}
                        className="font-medium hover:underline"
                      >
                        {place.name}
                      </Link>
                      <p className="text-dolch-muted text-xs">
                        Added by{" "}
                        {place.created_by
                          ? (nameById.get(place.created_by) ??
                            `Teammate ${place.created_by.slice(0, 6)}`)
                          : "Discovery (OSM)"}
                        {" · "}
                        {place.status.replace("_", " ")}
                      </p>
                    </div>
                    {place.status === "blocked" && (
                      <Button
                        size="sm"
                        onClick={() => unblock(place.id)}
                        disabled={busyId === place.id}
                      >
                        {busyId === place.id ? "Restoring…" : "Restore"}
                      </Button>
                    )}
                  </div>
                  {place.status === "blocked" && lastAction?.action === "block" && (
                    <p className="text-dolch-muted text-xs">
                      Blocked by {lastAction.actor_display_name ?? "someone"}{" "}
                      {lastAction.created_at
                        ? `on ${formatDateTime(lastAction.created_at)}`
                        : ""}
                      {lastAction.reason ? ` — "${lastAction.reason}"` : ""}
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {logData?.log && logData.log.length > 0 && (
        <section>
          <SectionHeading>Full activity log</SectionHeading>
          <ul className="space-y-1.5">
            {logData.log.map((entry) => (
              <li key={entry.id} className="text-dolch-muted text-xs">
                <span className="text-dolch-text font-medium">
                  {entry.actor_display_name ?? "Someone"}
                </span>{" "}
                {entry.action === "block" ? "blocked" : "restored"}{" "}
                <span className="text-dolch-text font-medium">
                  {entry.place_name ?? "a place"}
                </span>
                {entry.reason ? ` — "${entry.reason}"` : ""}
                {entry.created_at ? ` · ${formatDateTime(entry.created_at)}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
