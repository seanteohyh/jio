"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  LinkButton,
  SectionHeading,
  SkeletonDetail,
  Stars,
  inputClass,
} from "@/components/ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import SendLobangPanel from "@/components/profile/SendLobangPanel";
import ShareLink from "@/components/ShareLink";
import { placeShareUrl } from "@/lib/shareUrl";
import { config, features } from "@/lib/config";
import {
  formatCuisine,
  formatDate,
  googleMapsPlaceUrl,
  socialsLabel,
} from "@/lib/utils";
import SocialsIcon from "@/components/SocialsIcon";
import { DEFAULT_FILTERS, MAX_WALK_MINUTES } from "@/components/FilterBar";
import { walkTimeVisibilityNotice } from "@/lib/walkTimeNotice";
import type { AuthUser, FlagReason, Place, Visit } from "@/types";

interface PlaceResponse {
  place: Place;
  reviews: Visit[];
}

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

export default function PlaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  // CHANGES_20260818.md §1 — the profile History list's "Edit" link has no
  // form of its own; it lands here with the visit id to edit, since this
  // page already has the one "How was it?" form both create and edit reuse.
  const editVisitParam = searchParams.get("editVisit");

  const { data, error, isLoading, mutate } = useSWR<PlaceResponse>(
    `/api/places/${id}`,
    fetcher
  );
  const { data: wishlistData, mutate: mutateWishlist } = useSWR<{
    wishlist: { place_id: string }[];
  }>(features.wishlist ? "/api/wishlist" : null, fetcher);
  const { data: me } = useSWR<MeResponse>("/api/me", fetcher);
  // Own visits to this place, including private ones — only fetched while
  // actually resolving an ?editVisit= link, since the place page's own
  // `reviews` list is public-only and a private visit (History's whole
  // reason for existing) would never be found there.
  const { data: myVisitsData } = useSWR<{ visits: Visit[] }>(
    editVisitParam ? `/api/visits?placeId=${id}` : null,
    fetcher
  );

  const logFormRef = useRef<HTMLDivElement>(null);
  const [logging, setLogging] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [rating, setRating] = useState(4);
  const [notes, setNotes] = useState("");
  const [dishes, setDishes] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState<FlagReason>("wrong_info");
  const [reportComment, setReportComment] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [sendingLobang, setSendingLobang] = useState(false);
  const [lobangSent, setLobangSent] = useState(false);
  const [lobangSentPublic, setLobangSentPublic] = useState(false);
  const [likingId, setLikingId] = useState<string | null>(null);

  useEffect(() => {
    if (!editVisitParam || !myVisitsData) return;
    const target = myVisitsData.visits.find((v) => v.id === editVisitParam);
    if (!target) return;
    setEditingVisitId(target.id);
    setRating(target.rating);
    setDishes(target.best_dishes.join(", "));
    setNotes(target.notes ?? "");
    setIsPublic(target.is_public);
    setLogging(true);
    setTimeout(
      () => logFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0
    );
    // Strip the query param once consumed — re-visiting or refreshing
    // shouldn't keep re-opening the form from a stale link.
    router.replace(`/places/${id}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editVisitParam, myVisitsData]);

  if (isLoading) return <SkeletonDetail />;
  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (!data) return null;

  const { place, reviews } = data;
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

  const toggleLike = async (visitId: string) => {
    setLikingId(visitId);
    setActionError(null);
    try {
      const result = await mutateJson<{ liked: boolean; like_count: number }>(
        `/api/visits/${visitId}/like`,
        "POST"
      );
      mutate(
        {
          ...data,
          reviews: reviews.map((r) =>
            r.id === visitId
              ? { ...r, liked_by_me: result.liked, like_count: result.like_count }
              : r
          ),
        },
        false
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update your like");
    } finally {
      setLikingId(null);
    }
  };

  // Logs a new visit, or amends one you already logged — CHANGES_20260818.md
  // §1 reuses this exact form for both rather than building a second one;
  // only which endpoint it calls differs.
  const submitVisit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setActionError(null);

    try {
      const body = {
        rating,
        notes: notes.trim() || null,
        best_dishes: dishes
          .split(/[,\n]+/)
          .map((d) => d.trim())
          .filter(Boolean),
        is_public: isPublic,
      };
      if (editingVisitId) {
        await mutateJson(`/api/visits/${editingVisitId}`, "PATCH", body);
      } else {
        await mutateJson("/api/visits", "POST", { place_id: place.id, ...body });
      }
      setLogging(false);
      setEditingVisitId(null);
      setNotes("");
      setDishes("");
      mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  // "I ate here" always starts a fresh, blank log — closing the form (if
  // open) resets any edit in progress rather than leaving stale values
  // behind for next time it opens.
  const toggleLogging = () => {
    if (logging) {
      setLogging(false);
      setEditingVisitId(null);
      return;
    }
    setEditingVisitId(null);
    setRating(4);
    setDishes("");
    setNotes("");
    setIsPublic(true);
    setActionError(null);
    setLogging(true);
  };

  const startEdit = (review: Visit) => {
    setEditingVisitId(review.id);
    setRating(review.rating);
    setDishes(review.best_dishes.join(", "));
    setNotes(review.notes ?? "");
    setIsPublic(review.is_public);
    setActionError(null);
    setLogging(true);
    // The form sits above the Reviews list it's reachable from here, so a
    // click deep in a long list needs to actually bring it into view.
    setTimeout(
      () => logFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0
    );
  };

  const approve = async () => {
    setBusy(true);
    try {
      await mutateJson(`/api/places/${place.id}/review`, "POST", {
        approve: true,
      });
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
      await mutateJson(`/api/places/${place.id}/review`, "POST", {
        approve: false,
      });
      router.push("/places");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not reject");
      setBusy(false);
    }
  };

  const submitBlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setActionError(null);
    try {
      await mutateJson(`/api/places/${place.id}/block`, "POST", {
        reason: blockReason.trim(),
      });
      router.push("/places");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not remove that place"
      );
      setBusy(false);
    }
  };

  const unblock = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await mutateJson(`/api/places/${place.id}/unblock`, "POST");
      mutate();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not restore that place"
      );
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setActionError(null);
    try {
      await mutateJson(`/api/places/${place.id}/flag`, "POST", {
        reason: reportReason,
        comment: reportComment.trim() || undefined,
      });
      setReportComment("");
      setReporting(false);
      setReportSent(true);
      mutate();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not send that report"
      );
    } finally {
      setBusy(false);
    }
  };

  const walkNotice = walkTimeVisibilityNotice(place.walk_minutes, {
    defaultMaxWalk: DEFAULT_FILTERS.maxWalk,
    sliderMax: MAX_WALK_MINUTES,
  });

  const isAdmin = me?.user?.is_admin ?? false;
  const canBlock =
    place.status === "active" &&
    !!me?.user &&
    (isAdmin || place.created_by === me.user.id);
  const canUnblock = place.status === "blocked" && isAdmin;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{place.name}</h1>
        {place.address && (
          <p className="text-stone mt-1 text-sm">{place.address}</p>
        )}

        <div className="text-stone mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {typeof place.walk_minutes === "number" && (
            <span>{place.walk_minutes} min walk</span>
          )}
          <BudgetBadge tier={place.budget_tier} />
          <Stars rating={place.avg_rating} size="md" />
          {place.visit_count ? <span>{place.visit_count} visits</span> : null}
          {place.has_pending_flag && (
            <span className="bg-amber/20 text-amber-text rounded-full px-2 py-0.5 text-xs font-medium">
              Reported
            </span>
          )}
        </div>

        {/*
          This page is reachable regardless of status/filters (see the API
          route), so it's the one place that can explain why a place a
          filter is hiding elsewhere isn't actually missing — see
          walkTimeNotice.ts for the exact thresholds and reasoning.
        */}
        {walkNotice && <p className="text-stone mt-2 text-xs">{walkNotice}</p>}

        {(place.cuisine.length > 0 ||
          place.custom_cuisine_tags.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {place.cuisine.map((c) => (
              <Chip key={c}>{formatCuisine(c)}</Chip>
            ))}
            {place.custom_cuisine_tags.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
        )}
      </header>

      {/*
        CHANGES_20260816.md §4 follow-up — the "Share this lobang" trigger
        itself moved down into the tier-2 button row (with "View on Google
        Maps"), rather than standing alone above "What to order" the way
        the old ShareLink card used to. Falls back to the plain ShareLink
        here, in its original spot, when lobangs is off (or before `me`
        has loaded) — that path has no button to fold into a row that only
        renders for signed-in lobang users.
      */}
      {place.status === "active" && !(features.lobangs && !!me?.user) && (
        <ShareLink
          url={placeShareUrl(place.id)}
          label="Share this place"
          shareText={`Check out ${place.name} on ${config.appName}`}
        />
      )}

      {place.status === "needs_review" && (
        <Card className="border-amber/40 bg-amber-tint/60 space-y-3">
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

      {place.status === "blocked" && (
        <Card className="space-y-3 border-ember/30 bg-ember-tint/50">
          <p className="text-sm">
            <span className="font-medium">This place is hidden.</span> It
            won&apos;t appear in search, suggestions, or new events until an
            admin restores it. Full history is in the Moderation view.
          </p>
          {canUnblock && (
            <Button size="sm" onClick={unblock} disabled={busy}>
              Restore this place
            </Button>
          )}
        </Card>
      )}

      {place.notes && (
        <Card>
          <p className="text-sm whitespace-pre-wrap">{place.notes}</p>
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

      {/*
        CHANGES_20260816.md §1 — three tiers by how often each is actually
        used, built entirely from variants ui.tsx already defined but this
        page never reached for (`ghost`, `LinkButton`'s `size`/external-link
        support). Eight lookalike buttons in one flat row gets messier with
        every action this file adds (lobang, the Maps link, likes next) —
        tiering is what gives that growth somewhere to go.
      */}
      <div className="space-y-3">
        <div>
          <p className="text-stone mb-1.5 text-xs font-medium">Your visit</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={toggleLogging}>
              {logging ? "Never mind" : "I ate here"}
            </Button>
            {features.wishlist && (
              <Button variant="secondary" onClick={toggleWishlist}>
                {onWishlist ? "On your list ✓" : "Want to try"}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/*
            No separate "Directions" button — CHANGES_20260816.md §1 follow-up.
            Google's own listing gets you turn-by-turn from there in one more
            tap, so a dedicated Directions button was one more thing pointing
            at the same app for marginal benefit.
          */}
          <LinkButton
            href={googleMapsPlaceUrl(place)}
            variant="secondary"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Google Maps
          </LinkButton>
          {place.socials_url && (
            <LinkButton
              href={place.socials_url}
              variant="secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="flex items-center gap-1.5">
                <SocialsIcon url={place.socials_url} className="h-3.5 w-3.5" />
                {socialsLabel(place.socials_url)}
              </span>
            </LinkButton>
          )}
          {place.status === "active" && features.lobangs && !!me?.user && (
            <Button
              variant="secondary"
              onClick={() => {
                setLobangSent(false);
                setSendingLobang((v) => !v);
              }}
            >
              {sendingLobang ? "Never mind" : "Share this lobang"}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {/*
            Open to anyone signed in, deliberately. Correcting a wrong cuisine or
            a bad pin is the sort of thing that should take five seconds, not a
            report and a wait. Taking a place *out* of circulation is the gated
            action — that is "Remove this place" below, and archiving is
            admin-only.
          */}
          <LinkButton href={`/places/${place.id}/edit`} variant="ghost" size="sm">
            Edit details
          </LinkButton>
          {place.status === "active" && !!me?.user && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setReportSent(false);
                setReporting((v) => !v);
              }}
            >
              {reporting ? "Never mind" : "Report an issue"}
            </Button>
          )}
        </div>

        {canBlock && (
          <div className="border-line border-t pt-3">
            <Button variant="danger" onClick={() => setBlocking((v) => !v)}>
              {blocking ? "Never mind" : "Remove this place"}
            </Button>
          </div>
        )}
      </div>

      {lobangSent && (
        <p className="text-sage text-xs">
          {lobangSentPublic ? "Link created." : "Lobang sent."}
        </p>
      )}

      {reportSent && (
        <p className="text-stone text-xs">
          Thanks — an admin will take a look. You can track it under My
          Reports on your profile.
        </p>
      )}

      {reporting && (
        <Card className="animate-fade-in space-y-3">
          <form onSubmit={submitReport} className="space-y-3">
            <Field label="What's wrong?">
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value as FlagReason)}
                className={inputClass}
              >
                {(Object.keys(FLAG_REASON_LABELS) as FlagReason[]).map((key) => (
                  <option key={key} value={key}>
                    {FLAG_REASON_LABELS[key]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Details (optional)">
              <textarea
                value={reportComment}
                onChange={(e) => setReportComment(e.target.value)}
                className={`${inputClass} min-h-16`}
                placeholder="Anything that helps an admin check this"
              />
            </Field>
            <p className="text-stone text-xs">
              The place stays visible while this is reviewed — reporting
              doesn&apos;t remove it.
            </p>
            <Button type="submit" variant="secondary" disabled={busy}>
              {busy ? "Sending…" : "Send report"}
            </Button>
          </form>
        </Card>
      )}

      {blocking && (
        <Card className="animate-fade-in space-y-3">
          <form onSubmit={submitBlock} className="space-y-3">
            <Field
              label="Why is this being removed?"
              hint="Shown to admins in the moderation log."
            >
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className={`${inputClass} min-h-16`}
                placeholder="Duplicate, permanently closed, not a real place…"
              />
            </Field>
            <Button
              type="submit"
              variant="danger"
              disabled={busy || !blockReason.trim()}
            >
              {busy ? "Removing…" : "Remove this place"}
            </Button>
          </form>
        </Card>
      )}

      {sendingLobang && me?.user && (
        <SendLobangPanel
          selfId={me.user.id}
          defaultPlaceId={place.id}
          defaultPlaceName={place.name}
          onSent={(wasPublic) => {
            setSendingLobang(false);
            setLobangSent(true);
            setLobangSentPublic(!!wasPublic);
          }}
          onCancel={() => setSendingLobang(false)}
        />
      )}

      {logging && (
        <div ref={logFormRef}>
          <Card className="animate-fade-in">
            <form onSubmit={submitVisit} className="space-y-3">
              <div>
                <p className="text-ink mb-1.5 text-sm font-medium">
                  {editingVisitId ? "Edit your review" : "How was it?"}
                </p>
                <div
                  role="radiogroup"
                  aria-label="Rating"
                  className="flex gap-1"
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                    e.preventDefault();
                    const next =
                      e.key === "ArrowRight"
                        ? Math.min(5, rating + 1)
                        : Math.max(1, rating - 1);
                    setRating(next);
                    (
                      e.currentTarget.querySelector(
                        `[data-star="${next}"]`
                      ) as HTMLButtonElement | null
                    )?.focus();
                  }}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      data-star={n}
                      role="radio"
                      aria-checked={n === rating}
                      tabIndex={n === rating ? 0 : -1}
                      onClick={() => setRating(n)}
                      aria-label={`${n} star${n === 1 ? "" : "s"}`}
                      // UX review log #2 — a real 44px tap target on the
                      // actual interactive rating control (read-only star
                      // displays elsewhere, e.g. `Stars` in ui.tsx, are
                      // untouched: this is scoped to the input only).
                      // min-w/min-h + centering grows the tappable box
                      // without changing the glyph's own visual size.
                      className={
                        "flex min-h-11 min-w-11 items-center justify-center text-2xl " +
                        (n <= rating ? "text-amber" : "text-line")
                      }
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <Field label="What would you recommend?" hint="Comma or line separated.">
                {/*
                  A plain `<input>` submits its enclosing form on Enter —
                  standard browser behaviour, and exactly what iOS's "Go"
                  keyboard button does too. A one-line comma list invites
                  exactly that keystroke while still typing the next dish,
                  so this is a `<textarea>` instead: Enter makes a line
                  break, never a submit. `submitVisit` already splits on
                  either a comma or a newline.
                */}
                <textarea
                  value={dishes}
                  onChange={(e) => setDishes(e.target.value)}
                  className={`${inputClass} min-h-16`}
                  rows={2}
                  placeholder="Bak chor mee"
                />
              </Field>

              <Field label="Your review">
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
                  className="accent-ember"
                />
                <span>Share this as a review the team can read</span>
              </label>

              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : editingVisitId ? "Save changes" : "Save"}
              </Button>
            </form>
          </Card>
        </div>
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
                  className="border-line bg-cream/60 rounded-xl border p-3"
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
                        <span className="text-stone shrink-0 text-xs">
                          {formatDate(review.visited_at)}
                        </span>
                      </div>
                      <Stars rating={review.rating} />
                      {review.best_dishes.length > 0 && (
                        <p className="text-stone mt-1 text-sm">
                          <span className="font-medium">Recos:</span>{" "}
                          {review.best_dishes.join(", ")}
                        </p>
                      )}
                      {review.notes && (
                        <p className="mt-1 text-sm whitespace-pre-wrap">{review.notes}</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleLike(review.id)}
                          disabled={likingId === review.id}
                          // UX review log #3 — a stable accessible name
                          // ("Like"/"Unlike") instead of the count-dependent
                          // "♡ Like" / "♥ 3" the report found, plus
                          // aria-pressed for the toggle state.
                          aria-label={review.liked_by_me ? "Unlike" : "Like"}
                          aria-pressed={review.liked_by_me}
                          className={`tap-target-text inline-flex items-center gap-1 text-xs font-medium ${
                            review.liked_by_me
                              ? "text-ember"
                              : "text-stone hover:text-ink"
                          }`}
                        >
                          <span aria-hidden="true">
                            {review.liked_by_me ? "♥" : "♡"}{" "}
                            {review.like_count > 0 ? review.like_count : "Like"}
                          </span>
                        </button>
                        {/* CHANGES_20260818.md §1 — own reviews only; a
                            teammate's review renders identically either
                            way, so there's nowhere else on it an edit
                            control could hang. */}
                        {me?.user?.id === review.user_id && (
                          <button
                            type="button"
                            onClick={() => startEdit(review)}
                            className="text-stone hover:text-ink text-xs font-medium"
                          >
                            Edit
                          </button>
                        )}
                      </div>
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
