"use client";

import { Suspense, useState } from "react";
import useSWR from "swr";
import PlaceCard from "@/components/PlaceCard";
import RouletteWheel from "@/components/RouletteWheel";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  SectionHeading,
  SkeletonRows,
  Spinner,
} from "@/components/ui";
import FilterBar, {
  DEFAULT_FILTERS,
  type FilterState,
} from "@/components/FilterBar";
import { fetcher } from "@/lib/fetcher";
import { features } from "@/lib/config";
import type { Kaki, ScoredPlace, WeatherForecast } from "@/types";

interface SuggestResponse {
  suggestions: (ScoredPlace & { why: string })[];
  surprise: (ScoredPlace & { why: string }) | null;
  weather: WeatherForecast | null;
  mode: string;
}

function SuggestBody() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [mode, setMode] = useState<"personal" | "group">("personal");
  const [kakiId, setKakiId] = useState("");
  const [showWheel, setShowWheel] = useState(false);

  const { data: kakiData } = useSWR<{ kakis: Kaki[] }>(
    features.kakis ? "/api/kakis" : null,
    fetcher
  );

  const query = new URLSearchParams({ limit: "12", mode });
  if (filters.cuisines.length > 0) {
    query.set("cuisines", filters.cuisines.join(","));
  }
  query.set("maxWalk", String(filters.maxWalk));
  if (mode === "group" && kakiId) query.set("kakiId", kakiId);

  const { data, error, isLoading, mutate } = useSWR<SuggestResponse>(
    `/api/suggest?${query.toString()}`,
    fetcher
  );

  const suggestions = (data?.suggestions ?? []).filter(
    (s) => s.place.budget_tier <= filters.budgetMax
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Suggest</h1>
        <p className="text-stone mt-1 text-sm">
          Ranked on what you rate highly, what fits your budget, how far it is
          and how recently you were there.
        </p>
      </header>

      {data?.weather?.rainLikely && (
        <div className="border-line bg-cream flex items-start gap-2 rounded-xl border px-4 py-3 text-sm">
          <span aria-hidden="true">🌧️</span>
          <p>
            <span className="font-medium">Rain expected</span> around{" "}
            {data.weather.area}. Closer places have been pushed up the list.
          </p>
        </div>
      )}

      {features.kakis && kakiData?.kakis && kakiData.kakis.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={mode === "personal" ? "primary" : "secondary"}
            onClick={() => setMode("personal")}
          >
            Just me
          </Button>
          <Button
            size="sm"
            variant={mode === "group" ? "primary" : "secondary"}
            onClick={() => setMode("group")}
          >
            For a group
          </Button>

          {mode === "group" && (
            <select
              value={kakiId}
              onChange={(e) => setKakiId(e.target.value)}
              className="border-line bg-paper rounded-lg border px-2 py-1.5 text-sm"
              aria-label="Which group"
            >
              <option value="">Pick a group…</option>
              {kakiData.kakis.map((kaki) => (
                <option key={kaki.id} value={kaki.id}>
                  {kaki.name} ({kaki.member_count})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {mode === "group" && (
        <p className="text-stone text-xs">
          Group mode averages everyone&apos;s score. Anything a single member
          has blocked or dislikes is dropped entirely.
        </p>
      )}

      <FilterBar value={filters} onChange={setFilters} showSearch={false} />

      {data?.surprise && (
        <Card className="border-ember/30 bg-ember-tint/20">
          <SectionHeading>Surprise me</SectionHeading>
          <PlaceCard
            place={data.surprise.place}
            why={data.surprise.why}
            compact
          />
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => mutate()}
          >
            Try another
          </Button>
        </Card>
      )}

      {error && <ErrorNote>{error.message}</ErrorNote>}
      {isLoading && <SkeletonRows count={5} rowClassName="h-20 w-full" />}

      {!isLoading && suggestions.length === 0 && !error && (
        <EmptyState
          title="Nothing matched"
          description="Try widening the walk radius or clearing a cuisine filter."
        />
      )}

      {suggestions.length > 0 && (
        <section>
          <SectionHeading
            action={
              features.roulette && (
                <button
                  type="button"
                  onClick={() => setShowWheel((s) => !s)}
                  className="text-ember text-xs underline"
                >
                  {showWheel ? "Hide wheel" : "Can't decide?"}
                </button>
              )
            }
          >
            Top picks
          </SectionHeading>

          {showWheel && (
            <Card className="mb-4">
              <RouletteWheel
                places={suggestions.slice(0, 8).map((s) => s.place)}
                onResult={() => {}}
              />
            </Card>
          )}

          <ul className="space-y-2">
            {suggestions.map((scored, index) => (
              <li key={scored.place.id}>
                <PlaceCard
                  place={scored.place}
                  why={scored.why}
                  rank={index + 1}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function SuggestPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SuggestBody />
    </Suspense>
  );
}
