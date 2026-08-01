"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PlaceForm from "@/components/places/PlaceForm";
import { ErrorNote, Spinner } from "@/components/ui";
import { mutateJson } from "@/lib/fetcher";

function NewPlaceBody() {
  const params = useSearchParams();
  const router = useRouter();
  const [attachError, setAttachError] = useState<string | null>(null);

  // Arriving from a Jio's "add it to the pool?" prompt (§8): the new place
  // gets attached to the free-text option that's already on the ballot,
  // rather than just sitting in the list unconnected to why it was added.
  const fromEvent = params.get("fromEvent");
  const draftPlaceId = params.get("draftPlaceId");

  const onSaved = async (newPlaceId: string) => {
    if (!fromEvent || !draftPlaceId) {
      router.push(`/places/${newPlaceId}`);
      return;
    }
    try {
      await mutateJson(`/api/events/${fromEvent}/options`, "PATCH", {
        old_place_id: draftPlaceId,
        new_place_id: newPlaceId,
      });
      router.push(`/events/${fromEvent}`);
    } catch (err) {
      // The place itself was created fine — only the attach step failed.
      // Stay put and show it rather than navigating away, since the error
      // would just flash and vanish; the option stays free-text until
      // someone retries the attach.
      setAttachError(
        err instanceof Error ? err.message : "Could not attach that place"
      );
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Add a place</h1>
        <p className="text-stone mt-1 text-sm">
          Everything except the name and location can be filled in later.
        </p>
      </header>

      {attachError && (
        <ErrorNote>
          {attachError} The place was still added.{" "}
          {fromEvent && (
            <Link href={`/events/${fromEvent}`} className="underline">
              Back to the Jio
            </Link>
          )}
        </ErrorNote>
      )}

      {/* `key` so arriving from the importer with a different ?name= remounts
          the form rather than leaving the previous name in state. */}
      <PlaceForm
        key={params.get("name") ?? ""}
        initialName={params.get("name") ?? ""}
        onSaved={fromEvent && draftPlaceId ? onSaved : undefined}
      />
    </div>
  );
}

export default function NewPlacePage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<Spinner />}>
      <NewPlaceBody />
    </Suspense>
  );
}
