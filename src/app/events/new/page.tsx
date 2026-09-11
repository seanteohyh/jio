"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import JioForm from "@/components/events/JioForm";
import { Skeleton, SkeletonDetail, Spinner } from "@/components/ui";
import { fetcher } from "@/lib/fetcher";
import type { EventDetail, Place } from "@/types";

/**
 * The full-page way to start a Jio.
 *
 * The form itself lives in a shared component because the home screen renders
 * exactly the same thing inline — see the note in `JioForm`.
 */
function NewEventBody() {
  const params = useSearchParams();
  // "Same as last time?" — one-tap repeat (CHANGES_20260801.md §10). Only
  // prefills; still lands on the ordinary form for a look-over before it's
  // real, same spirit as the blog importer prefilling a place's name.
  const repeatFrom = params.get("repeatFrom");
  // "Start a Jio with them" from a personal invite link (CHANGES_20260818.md
  // §3 / docs/user-discovery.md §4.3) — pre-selects one invitee, nothing
  // else. Ignored if repeatFrom is also present; repeating an old Jio
  // already carries its own invitee list.
  const inviteUserId = params.get("invite");
  // "Start a Jio from here" — a lobang's heart/reply/start-a-Jio row
  // (CHANGES §3). Ignored alongside repeatFrom's own place list, same
  // "repeating an old Jio already carries its own" precedent.
  const placeId = params.get("placeId");

  const { data, isLoading } = useSWR<{ event: EventDetail }>(
    repeatFrom ? `/api/events/${repeatFrom}` : null,
    fetcher
  );
  const { data: placeData, isLoading: placeLoading } = useSWR<{
    place: Place;
  }>(placeId && !repeatFrom ? `/api/places/${placeId}` : null, fetcher);

  if ((repeatFrom && isLoading) || (placeId && !repeatFrom && placeLoading)) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Start a Jio</h1>
          <Skeleton className="mt-2 h-4 w-48" />
        </header>
        <SkeletonDetail />
      </div>
    );
  }

  const source = data?.event;
  const initialPlaceIds = source
    ? source.options.filter((o) => !o.label).map((o) => o.place_id)
    : placeData?.place
      ? [placeData.place.id]
      : undefined;
  const initialInvite = source
    ? {
        userIds: source.invitees.map((i) => i.user_id),
        kakiIds: source.kaki_id ? [source.kaki_id] : [],
      }
    : inviteUserId
      ? { userIds: [inviteUserId], kakiIds: [] }
      : undefined;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Start a Jio</h1>
        <p className="text-stone mt-1 text-sm">
          {source
            ? `Prefilled from "${source.title}" — change anything before it's real.`
            : placeData?.place
              ? `Prefilled with ${placeData.place.name} — change anything before it's real.`
              : "Pick a few options. Everyone ranks them, and the Borda count settles it."}
        </p>
      </header>

      <JioForm
        key={repeatFrom ?? placeId ?? ""}
        variant="page"
        initialTitle={source?.title}
        initialPlaceIds={initialPlaceIds}
        initialInvite={initialInvite}
      />
    </div>
  );
}

export default function NewEventPage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<Spinner />}>
      <NewEventBody />
    </Suspense>
  );
}
