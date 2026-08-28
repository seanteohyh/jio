"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, ErrorNote, SectionHeading, SkeletonDetail } from "@/components/ui";
import { ExportCsvButton, RankedList } from "@/components/admin/AdminAnalyticsCharts";
import { useAnalyticsDays } from "@/components/admin/AdminDateRangePicker";
import { fetcher, mutateJson } from "@/lib/fetcher";
import type { AdminUserSegmentKey, AdminUserSummary, AdminUsersData } from "@/types";

const SEGMENT_INFO: Record<
  AdminUserSegmentKey,
  { title: string; blurb: string; metric: (u: AdminUserSummary) => number; suffix: string }
> = {
  powerHosts: {
    title: "Power hosts",
    blurb: "Hosts often, votes rarely.",
    metric: (u) => u.hostedCount,
    suffix: " hosted",
  },
  activeVoters: {
    title: "Active voters",
    blurb: "Votes often, rarely hosts.",
    metric: (u) => u.votedCount,
    suffix: " voted",
  },
  rsvpOnlyLurkers: {
    title: "RSVP-only lurkers",
    blurb: "Responds to invites, but rarely votes or hosts.",
    metric: (u) => u.rsvpCount,
    suffix: " RSVPs (lifetime)",
  },
  reviewers: {
    title: "Reviewers",
    blurb: "Logs visits and ratings consistently.",
    metric: (u) => u.reviewCount,
    suffix: " reviews",
  },
  dormant: {
    title: "Dormant",
    blurb: "No activity at all in the last 30 days.",
    metric: (u) => u.score,
    suffix: " pts in window",
  },
  newAndActive: {
    title: "New & active",
    blurb: "Joined in the last 30 days and already engaged.",
    metric: (u) => u.score,
    suffix: " pts in window",
  },
};

type WeightKey = Exclude<keyof AdminUsersData["weights"], "updatedAt">;

const WEIGHT_FIELDS: { key: WeightKey; label: string }[] = [
  { key: "hosted", label: "Hosting a Jio" },
  { key: "voted", label: "Voting" },
  { key: "rsvp", label: "RSVPing" },
  { key: "visit", label: "Logging a visit" },
  { key: "review", label: "Writing a public review" },
  { key: "lobang", label: "Sending a lobang" },
];

function WeightsForm({
  weights,
  onSaved,
}: {
  weights: AdminUsersData["weights"];
  onSaved: () => void;
}) {
  const [values, setValues] = useState({
    hosted: weights.hosted,
    voted: weights.voted,
    rsvp: weights.rsvp,
    visit: weights.visit,
    review: weights.review,
    lobang: weights.lobang,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await mutateJson("/api/admin/analytics/users/weights", "PUT", values);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3">
      <SectionHeading>Score weights</SectionHeading>
      <p className="text-stone text-xs">
        Equal by default — adjust how much each activity counts toward the
        composite score below. Saving applies immediately to the
        leaderboard and every segment.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {WEIGHT_FIELDS.map((f) => (
          <label key={f.key} className="text-xs">
            <span className="text-stone">{f.label}</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={values[f.key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }))
              }
              className="border-line bg-paper text-ink mt-1 w-full rounded-lg border px-2 py-1.5"
            />
          </label>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="bg-ember rounded-lg px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save weights"}
      </button>
      {weights.updatedAt && (
        <p className="text-stone text-[11px]">
          Last changed {new Date(weights.updatedAt).toLocaleString()}
        </p>
      )}
    </Card>
  );
}

/** Part 1 §B — leaderboard, admin-adjustable score weights, and six
 *  rule-based segments. Segments aren't a partition — a person can appear
 *  in more than one, or none. */
export default function AdminAnalyticsUsersPage() {
  const days = useAnalyticsDays();
  const { data, error, isLoading, mutate } = useSWR<{ usersData: AdminUsersData }>(
    `/api/admin/analytics/users?days=${days}`,
    fetcher
  );

  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (isLoading) return <SkeletonDetail />;
  if (!data?.usersData) return null;

  const { usersData } = data;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-2">
          <SectionHeading>Leaderboard</SectionHeading>
          <ExportCsvButton
            filename="users-leaderboard.csv"
            headers={["name", "score", "hosted", "voted", "rsvps", "visits", "reviews", "lobangs"]}
            rows={usersData.leaderboard.map((u) => [
              u.name,
              u.score,
              u.hostedCount,
              u.votedCount,
              u.rsvpCount,
              u.visitCount,
              u.reviewCount,
              u.lobangCount,
            ])}
          />
        </div>
        <p className="text-stone mb-2 text-xs">
          Composite score across the last {usersData.windowDays} days
          (RSVPs are counted lifetime — <code>event_rsvps</code> has no
          timestamp to window by). H = hosted, V = voted, R = RSVPs, Vi =
          visits, Rv = reviews, L = lobangs sent.
        </p>
        <RankedList
          items={usersData.leaderboard.map((u) => ({
            id: u.id,
            name: u.name,
            count: u.score,
          }))}
          formatValue={(item) => {
            const u = usersData.leaderboard.find((x) => x.id === item.id)!;
            return `${u.score} pts · H${u.hostedCount} V${u.votedCount} R${u.rsvpCount} Vi${u.visitCount} Rv${u.reviewCount} L${u.lobangCount}`;
          }}
          linkTo={(item) => `/admin/analytics/users/${item.id}`}
        />
      </Card>

      <WeightsForm weights={usersData.weights} onSaved={() => mutate()} />

      {(Object.keys(SEGMENT_INFO) as AdminUserSegmentKey[]).map((key) => {
        const info = SEGMENT_INFO[key];
        const members = usersData.segments[key];
        return (
          <Card key={key}>
            <SectionHeading>{info.title}</SectionHeading>
            <p className="text-stone mb-2 text-xs">{info.blurb}</p>
            {members.length === 0 ? (
              <p className="text-stone text-xs">Nobody in this segment right now.</p>
            ) : (
              <RankedList
                items={members.map((u) => ({
                  id: u.id,
                  name: u.name,
                  count: info.metric(u),
                }))}
                suffix={info.suffix}
                linkTo={(item) => `/admin/analytics/users/${item.id}`}
              />
            )}
          </Card>
        );
      })}
    </div>
  );
}
