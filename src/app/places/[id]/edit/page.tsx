"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import PlaceForm from "@/components/places/PlaceForm";
import { ErrorNote, SkeletonDetail } from "@/components/ui";
import { fetcher } from "@/lib/fetcher";
import type { Place } from "@/types";

/**
 * Correct a place's details.
 *
 * Open to any signed-in user, which is the deliberate posture: anyone can fix
 * a wrong cuisine or a bad pin, but only /block and /archive can take a place
 * out of circulation, and archiving is admin-only. Fix what you can, flag what
 * you can't.
 */
export default function EditPlacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data, error, isLoading } = useSWR<{ place: Place }>(
    `/api/places/${id}`,
    fetcher
  );

  if (isLoading) return <SkeletonDetail />;
  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (!data?.place) return <ErrorNote>That place does not exist.</ErrorNote>;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit {data.place.name}
        </h1>
        <p className="text-stone mt-1 text-sm">
          Anyone can correct a place. Changes show for the whole team.
        </p>
      </header>

      <PlaceForm
        place={data.place}
        onSaved={() => {
          router.push(`/places/${id}`);
        }}
      />
    </div>
  );
}
