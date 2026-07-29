"use client";

import Link from "next/link";
import useSWR from "swr";
import { Avatar, EmptyState, SectionHeading } from "../ui";
import { fetcher } from "@/lib/fetcher";
import type { Reco } from "@/types";

/**
 * The Food Pool.
 *
 * Teammate recommendations, newest first. Distinct from reviews: a review is a
 * verdict on a visit, a reco is someone telling you to go.
 */
export default function RecosFeed({ limit = 6 }: { limit?: number }) {
  const { data, error, isLoading } = useSWR<{ recos: Reco[] }>(
    `/api/recos?limit=${limit}`,
    fetcher
  );

  if (isLoading || error) return null;

  const recos = data?.recos ?? [];

  if (recos.length === 0) {
    return (
      <section>
        <SectionHeading>Food pool</SectionHeading>
        <EmptyState
          title="Nothing recommended yet"
          description="Found somewhere good? Open the place and recommend it to the team."
        />
      </section>
    );
  }

  return (
    <section>
      <SectionHeading>Food pool</SectionHeading>
      <ul className="space-y-2">
        {recos.map((reco) => (
          <li
            key={reco.id}
            className="border-dolch-border bg-dolch-surface/60 rounded-xl border p-3"
          >
            <div className="flex items-start gap-2.5">
              <Avatar
                name={reco.display_name ?? "Teammate"}
                id={reco.user_id}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">
                    {reco.display_name ?? "A teammate"}
                  </span>
                  <span className="text-dolch-muted"> recommends </span>
                  {reco.place ? (
                    <Link
                      href={`/places/${reco.place_id}`}
                      className="text-dolch-accent font-medium hover:underline"
                    >
                      {reco.place.name}
                    </Link>
                  ) : (
                    <span className="font-medium">a place</span>
                  )}
                </p>

                {reco.comment && (
                  <p className="text-dolch-muted mt-1 text-sm italic">
                    “{reco.comment}”
                  </p>
                )}

                {reco.place && (
                  <p className="text-dolch-muted mt-1 text-xs">
                    {typeof reco.place.walk_minutes === "number" &&
                      `${reco.place.walk_minutes} min walk`}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
