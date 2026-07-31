"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PlaceForm from "@/components/places/PlaceForm";
import { Spinner } from "@/components/ui";

function NewPlaceBody() {
  const params = useSearchParams();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Add a place</h1>
        <p className="text-stone mt-1 text-sm">
          Everything except the name and location can be filled in later.
        </p>
      </header>

      {/* `key` so arriving from the importer with a different ?name= remounts
          the form rather than leaving the previous name in state. */}
      <PlaceForm key={params.get("name") ?? ""} initialName={params.get("name") ?? ""} />
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
