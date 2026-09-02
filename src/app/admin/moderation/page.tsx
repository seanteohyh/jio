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
  SkeletonDetail,
  SkeletonRows,
  inputClass,
} from "@/components/ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/utils";
import type {
  AuthUser,
  FlagReason,
  GeneralReport,
  GeneralReportCategory,
  ModerationLogEntry,
  Place,
  PlaceFlag,
  TeamUser,
} from "@/types";

const GENERAL_REPORT_LABELS: Record<GeneralReportCategory, string> = {
  not_working: "Something's not working",
  place_wrong: "A place's info is wrong",
  suggestion: "Suggestion",
  other: "Something else",
};

const FLAG_REASON_LABELS: Record<FlagReason, string> = {
  closed: "Permanently closed",
  wrong_info: "Wrong information",
  duplicate: "Duplicate of another place",
  inappropriate: "Inappropriate",
  other: "Other",
};

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
  const { data: flagsData, mutate: mutateFlags } = useSWR<{
    flags: PlaceFlag[];
  }>(isAdmin ? "/api/admin/flags" : null, fetcher);
  // UX review log #17 — "Report a problem"'s admin queue: same screen as
  // place flags (filterable by type, in the spec's own words) rather than
  // a separate inbox, just its own section since a general report has no
  // place to group it under.
  const { data: reportsData, mutate: mutateReports } = useSWR<{
    reports: GeneralReport[];
  }>(isAdmin ? "/api/admin/reports" : null, fetcher);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("blocked");
  const [creatorFilter, setCreatorFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockingPlaceId, setBlockingPlaceId] = useState<string | null>(null);
  const [flagBlockReason, setFlagBlockReason] = useState("");

  // Grouped so the admin resolves every pending flag on a place in one shot.
  const flagsByPlace = useMemo(() => {
    const map = new Map<string, PlaceFlag[]>();
    for (const flag of flagsData?.flags ?? []) {
      const list = map.get(flag.place_id) ?? [];
      list.push(flag);
      map.set(flag.place_id, list);
    }
    return map;
  }, [flagsData]);

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

  if (meLoading) return <SkeletonDetail />;
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

  const resolveFlags = async (
    placeId: string,
    resolution: "dismissed" | "edited" | "blocked",
    reason?: string
  ) => {
    setBusyId(placeId);
    setError(null);
    try {
      await mutateJson(`/api/admin/flags/${placeId}/resolve`, "POST", {
        resolution,
        reason,
      });
      setBlockingPlaceId(null);
      setFlagBlockReason("");
      mutateFlags();
      mutatePlaces();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not resolve that report"
      );
    } finally {
      setBusyId(null);
    }
  };

  const resolveReport = async (reportId: string) => {
    setBusyId(reportId);
    setError(null);
    try {
      await mutateJson(`/api/admin/reports/${reportId}/resolve`, "POST");
      await mutateReports();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not resolve that report"
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
        <p className="text-stone mt-1 text-sm">
          Every place, who added it, and the block/unblock history.
        </p>
      </header>

      {error && <ErrorNote>{error}</ErrorNote>}

      {(reportsData?.reports?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <SectionHeading>
            {reportsData!.reports.length} general report
            {reportsData!.reports.length === 1 ? "" : "s"}
          </SectionHeading>
          <ul className="space-y-2">
            {reportsData!.reports.map((r) => (
              <li key={r.id}>
                <Card className="space-y-2 border-amber/40 bg-amber-tint/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {GENERAL_REPORT_LABELS[r.category]}
                      </p>
                      <p className="text-stone mt-1 text-xs whitespace-pre-wrap">
                        {r.reported_by_name ?? "Someone"}
                        {r.comment ? `: "${r.comment}"` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === r.id}
                      onClick={() => resolveReport(r.id)}
                    >
                      Resolve
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {flagsByPlace.size > 0 && (
        <section className="space-y-2">
          <SectionHeading>
            {flagsByPlace.size} place{flagsByPlace.size === 1 ? "" : "s"}{" "}
            reported
          </SectionHeading>
          <ul className="space-y-2">
            {Array.from(flagsByPlace.entries()).map(([placeId, flags]) => (
              <li key={placeId}>
                <Card className="space-y-2 border-amber/40 bg-amber-tint/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/places/${placeId}`}
                        className="font-medium hover:underline"
                      >
                        {flags[0].place_name ?? "A place"}
                      </Link>
                      <ul className="text-stone mt-1 space-y-0.5 text-xs">
                        {flags.map((f) => (
                          <li key={f.id} className="whitespace-pre-wrap">
                            {FLAG_REASON_LABELS[f.reason]} —{" "}
                            {f.flagged_by_name ?? "someone"}
                            {f.comment ? `: "${f.comment}"` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === placeId}
                        onClick={() => resolveFlags(placeId, "dismissed")}
                      >
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === placeId}
                        onClick={() => resolveFlags(placeId, "edited")}
                      >
                        Mark fixed
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyId === placeId}
                        onClick={() =>
                          setBlockingPlaceId((prev) =>
                            prev === placeId ? null : placeId
                          )
                        }
                      >
                        Block
                      </Button>
                    </div>
                  </div>

                  {blockingPlaceId === placeId && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <input
                        value={flagBlockReason}
                        onChange={(e) => setFlagBlockReason(e.target.value)}
                        className={`${inputClass} flex-1`}
                        placeholder="Reason for blocking (shown in the log)"
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyId === placeId || !flagBlockReason.trim()}
                        onClick={() =>
                          resolveFlags(placeId, "blocked", flagBlockReason.trim())
                        }
                      >
                        Confirm block
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

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
        <SkeletonRows count={4} rowClassName="h-16 w-full" />
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
                      <p className="text-stone text-xs">
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
                    <p className="text-stone text-xs whitespace-pre-wrap">
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
              <li key={entry.id} className="text-stone text-xs whitespace-pre-wrap">
                <span className="text-ink font-medium">
                  {entry.actor_display_name ?? "Someone"}
                </span>{" "}
                {entry.action === "block" ? "blocked" : "restored"}{" "}
                <span className="text-ink font-medium">
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
