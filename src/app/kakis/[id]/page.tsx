"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import {
  Button,
  Card,
  ErrorNote,
  SectionHeading,
  SkeletonKakiDetail,
  Stars,
} from "@/components/ui";
import { KakiMetricsCharts } from "@/components/MetricsCharts";
import { useToast } from "@/components/Toast";
import AddKakiMemberPanel from "@/components/kakis/AddKakiMemberPanel";
import KakiFoodIdentityCard from "@/components/kakis/KakiFoodIdentityCard";
import PebbleAvatar from "@/components/kakis/PebbleAvatar";
import { InviteIcon } from "@/components/icons";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { formatDate } from "@/lib/utils";
import type {
  KakiDetail,
  KakiFoodIdentitySnapshot,
  KakiMetrics,
  Visit,
} from "@/types";

interface KakiResponse {
  kaki: KakiDetail;
  metrics: KakiMetrics;
  foodIdentity: KakiFoodIdentitySnapshot | null;
  freshReviews: Visit[];
  viewer: { id: string; isMember: boolean; isCreator: boolean };
}

export default function KakiDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const showToast = useToast();

  const { data, error, isLoading, mutate } = useSWR<KakiResponse>(
    `/api/kakis/${id}`,
    fetcher
  );

  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);

  if (isLoading) return <SkeletonKakiDetail />;
  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (!data) return null;

  const { kaki, metrics, foodIdentity, freshReviews, viewer } = data;

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
          freshReviews: freshReviews.map((r) =>
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

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/k/${kaki.invite_token}`
      : `/k/${kaki.invite_token}`;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the link is on screen to copy by hand.
    }
  };

  const leave = async () => {
    if (
      !window.confirm(
        "Leave this group? You'll need a new invite to get back in."
      )
    ) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await mutateJson(`/api/kakis/${id}`, "DELETE");
      showToast("Left the group");
      router.push("/kakis");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not leave");
      setBusy(false);
    }
  };

  const nameFor = (userId: string) =>
    kaki.members.find((m) => m.user_id === userId)?.display_name ??
    `Teammate ${userId.slice(0, 6)}`;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{kaki.name}</h1>
        <p className="text-stone mt-1 text-sm">
          {kaki.members.length} member{kaki.members.length === 1 ? "" : "s"}
          {kaki.created_at && ` · since ${formatDate(kaki.created_at)}`}
        </p>
      </header>

      {actionError && <ErrorNote>{actionError}</ErrorNote>}

      {/*
        UX review log #24 — reorder, not rebuild: "This group's vibe" moves
        from last-and-conditional to the opening card, directly under the
        header, since it's the page's best feature. Members and the
        invite-link card move down, otherwise unchanged.
      */}
      {metrics.groupTotalVisits > 0 && (
        <KakiFoodIdentityCard
          snapshot={foodIdentity}
          nameFor={nameFor}
          metrics={metrics}
        />
      )}

      <Card>
        <SectionHeading>Members</SectionHeading>
        <ul className="space-y-2">
          {kaki.members.map((member) => (
            <li key={member.user_id} className="flex items-center gap-2.5">
              <PebbleAvatar
                name={member.display_name ?? "Teammate"}
                id={member.user_id}
              />
              <span className="text-sm">
                {member.display_name ?? `Teammate ${member.user_id.slice(0, 6)}`}
                {member.user_id === kaki.created_by && (
                  <span className="text-stone text-xs"> · created it</span>
                )}
                {member.user_id === viewer.id && (
                  <span className="text-stone text-xs"> · you</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {viewer.isMember && (
          <div className="border-line mt-3 border-t pt-3">
            <AddKakiMemberPanel
              existingMemberIds={kaki.members.map((m) => m.user_id)}
              onAdd={async (userId) => {
                await mutateJson(`/api/kakis/${id}/members`, "POST", {
                  user_id: userId,
                });
                mutate();
              }}
            />
          </div>
        )}
      </Card>

      <Card>
        <SectionHeading>
          <span className="inline-flex items-center gap-1.5">
            <InviteIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Invite link
          </span>
        </SectionHeading>
        <p className="text-stone mb-2 text-xs">
          Anyone with this link can join. It is unguessable, but it is not a
          secret once you have shared it.
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={inviteUrl}
            className="border-line bg-paper text-stone flex-1 truncate rounded-lg border px-3 py-2 text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button size="sm" onClick={copyInvite}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </Card>

      <section>
        <SectionHeading>Group stats</SectionHeading>
        <p className="text-stone mb-3 text-xs">
          Built from visits members have shared. Private visits stay private, so
          these numbers are a floor, not a full picture.
        </p>
        <KakiMetricsCharts metrics={metrics} />
      </section>

      {freshReviews.length > 0 && (
        <Card>
          <SectionHeading>Fresh reviews</SectionHeading>
          <p className="text-stone mb-3 text-xs">
            The last few public reviews from this group, anywhere — not just
            places you've been to together.
          </p>
          <ul className="space-y-3">
            {freshReviews.map((review) => (
              <li key={review.id} className="flex items-start gap-2.5">
                <PebbleAvatar
                  name={review.display_name ?? "Teammate"}
                  id={review.user_id}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">
                      {review.display_name ?? "A teammate"}
                      <Link
                        href={`/places/${review.place_id}`}
                        className="text-stone font-normal underline"
                      >
                        {" "}
                        · {review.place_name ?? "a place"}
                      </Link>
                    </span>
                    <span className="text-stone shrink-0 text-xs">
                      {formatDate(review.visited_at)}
                    </span>
                  </div>
                  <Stars rating={review.rating} />
                  {review.notes && (
                    <p className="mt-1 text-sm whitespace-pre-wrap">
                      {review.notes}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleLike(review.id)}
                    disabled={likingId === review.id}
                    aria-label={review.liked_by_me ? "Unlike" : "Like"}
                    aria-pressed={review.liked_by_me}
                    className={`tap-target-text mt-1.5 inline-flex items-center gap-1 text-xs font-medium ${
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
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {viewer.isMember && (
        <Button variant="danger" onClick={leave} disabled={busy}>
          Leave this group
        </Button>
      )}
    </div>
  );
}
