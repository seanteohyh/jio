"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Avatar,
  BudgetBadge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  Field,
  SectionHeading,
  Spinner,
  Stars,
  inputClass,
} from "@/components/ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { features } from "@/lib/config";
import { formatCuisine, formatDate } from "@/lib/utils";
import type { Place, Reco, Visit } from "@/types";

interface PlaceResponse {
  place: Place;
  reviews: Visit[];
  recos: Reco[];
}

export default function PlaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data, error, isLoading, mutate } = useSWR<PlaceResponse>(
    `/api/places/${id}`,
    fetcher
  );
  const { data: wishlistData, mutate: mutateWishlist } = useSWR<{
    wishlist: { place_id: string }[];
  }>(features.wishlist ? "/api/wishlist" : null, fetcher);

  const [logging, setLogging] = useState(false);
  const [rating, setRating] = useState(4);
  const [notes, setNotes] = useState("");
  const [dishes, setDishes] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [recoComment, setRecoComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <Spinner label="Loading" />;
  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (!data) return null;

  const { place, reviews, recos } = data;
  const onWishlist =
    wishlistData?.wishlist.some((w) => w.place_id === place.id) ?? false;

  const toggleWishlist = async () => {
    setActionError(null);
    try {
      await mutateJson("/api/wishlist", "POST", { place_id: place.id });
      mutateWishlist();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save");
    }
  };

  const logVisit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setActionError(null);

    try {
      await mutateJson("/api/visits", "POST", {
        place_id: place.id,
        rating,
        notes: notes.trim() || null,
        best_dishes: dishes
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean),
        is_public: isPublic,
      });
      setLogging(false);
      setNotes("");
      setDishes("");
      mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const recommend = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await mutateJson("/api/recos", "POST", {
        place_id: place.id,
        comment: recoComment.trim() || null,
      });
      setRecoComment("");
      mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      await mutateJson(`/api/places/${place.id}`, "PUT", { status: "active" });
      mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not approve");
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    try {
      await mutateJson(`/api/places/${place.id}`, "PUT", { status: "blocked" });
      router.push("/places");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not reject");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{place.name}</h1>
        {place.address && (
          <p className="text-dolch-muted mt-1 text-sm">{place.address}</p>
        )}

        <div className="text-dolch-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {typeof place.walk_minutes === "number" && (
            <span>{place.walk_minutes} min walk</span>
          )}
          <BudgetBadge tier={place.budget_tier} />
          <Stars rating={place.avg_rating} size="md" />
          {place.visit_count ? <span>{place.visit_count} visits</span> : null}
        </div>

        {place.cuisine.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {place.cuisine.map((c) => (
              <Chip key={c}>{formatCuisine(c)}</Chip>
            ))}
          </div>
        )}
      </header>

      {place.status === "needs_review" && (
        <Card className="border-dolch-warn/40 bg-amber-50/60 space-y-3">
          <p className="text-sm">
            <span className="font-medium">Waiting for review.</span> This came
            from OpenStreetMap automatically — is it a real place people would
            actually eat at?
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={approve} disabled={busy}>
              Yes, add it
            </Button>
            <Button size="sm" variant="danger" onClick={reject} disabled={busy}>
              No, hide it
            </Button>
          </div>
        </Card>
      )}

      {place.notes && (
        <Card>
          <p className="text-sm">{place.notes}</p>
        </Card>
      )}

      {place.best_dishes.length > 0 && (
        <Card>
          <SectionHeading>What to order</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {place.best_dishes.map((dish) => (
              <Chip key={dish}>{dish}</Chip>
            ))}
          </div>
        </Card>
      )}

      {actionError && <ErrorNote>{actionError}</ErrorNote>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setLogging((v) => !v)}>
          {logging ? "Never mind" : "I ate here"}
        </Button>
        {features.wishlist && (
          <Button variant="secondary" onClick={toggleWishlist}>
            {onWishlist ? "On your list ✓" : "Want to try"}
          </Button>
        )}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=walking`}
          target="_blank"
          rel="noopener noreferrer"
          className="border-dolch-border bg-dolch-bg text-dolch-text hover:bg-dolch-surface inline-flex items-center rounded-lg border px-4 py-2.5 text-sm font-medium"
        >
          Directions
        </a>
      </div>

      {logging && (
        <Card className="animate-fade-in">
          <form onSubmit={logVisit} className="space-y-3">
            <div>
              <p className="text-dolch-text mb-1.5 text-sm font-medium">
                How was it?
              </p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    className={
                      n <= rating
                        ? "text-dolch-warn text-2xl"
                        : "text-dolch-border text-2xl"
                    }
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <Field label="What did you have?" hint="Comma separated.">
              <input
                value={dishes}
                onChange={(e) => setDishes(e.target.value)}
                className={inputClass}
                placeholder="Bak chor mee"
              />
            </Field>

            <Field label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputClass} min-h-16`}
                placeholder="Queue was 20 minutes. Worth it."
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="accent-dolch-accent"
              />
              <span>Share this as a review the team can read</span>
            </label>

            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </form>
        </Card>
      )}

      {features.recos && (
        <Card>
          <SectionHeading>Recommend it</SectionHeading>
          <p className="text-dolch-muted mb-2 text-xs">
            Puts it in the team&apos;s food pool and nudges it up everyone&apos;s
            suggestions.
          </p>
          <div className="flex gap-2">
            <input
              value={recoComment}
              onChange={(e) => setRecoComment(e.target.value)}
              className={inputClass}
              placeholder="Why should people go?"
            />
            <Button onClick={recommend} disabled={busy}>
              Add
            </Button>
          </div>

          {recos.length > 0 && (
            <ul className="mt-3 space-y-2">
              {recos.map((reco) => (
                <li key={reco.id} className="flex items-start gap-2 text-sm">
                  <Avatar
                    name={reco.display_name ?? "Teammate"}
                    id={reco.user_id}
                    size={22}
                  />
                  <span>
                    <span className="font-medium">{reco.display_name}</span>
                    {reco.comment && (
                      <span className="text-dolch-muted"> — {reco.comment}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {features.reviews && (
        <section>
          <SectionHeading>Reviews</SectionHeading>
          {reviews.length === 0 ? (
            <EmptyState
              title="No shared reviews yet"
              description="Log a visit and tick the share box to be the first."
            />
          ) : (
            <ul className="space-y-2">
              {reviews.map((review) => (
                <li
                  key={review.id}
                  className="border-dolch-border bg-dolch-surface/60 rounded-xl border p-3"
                >
                  <div className="flex items-start gap-2.5">
                    <Avatar
                      name={review.display_name ?? "Teammate"}
                      id={review.user_id}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">
                          {review.display_name ?? "A teammate"}
                        </span>
                        <span className="text-dolch-muted shrink-0 text-xs">
                          {formatDate(review.visited_at)}
                        </span>
                      </div>
                      <Stars rating={review.rating} />
                      {review.notes && (
                        <p className="mt-1 text-sm">{review.notes}</p>
                      )}
                      {review.best_dishes.length > 0 && (
                        <p className="text-dolch-muted mt-1 text-xs">
                          Had: {review.best_dishes.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
