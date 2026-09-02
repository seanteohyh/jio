"use client";

import { useState } from "react";
import Link from "next/link";
import { DownloadIcon } from "@/components/icons";
import { Card, SectionHeading } from "@/components/ui";
import { cn, dateKey, formatCuisine, sgtToday } from "@/lib/utils";
import { downloadCsv, toCsv } from "@/lib/csv";
import type { AdminAnalytics, DateCount, NamedCount } from "@/types";

/**
 * §13 admin analytics dashboard — presentational pieces.
 *
 * Same rendering philosophy as `MetricsCharts.tsx`: proportional widths on
 * styled `div`s, not a charting library, for a handful of bars and a
 * sparkline. Costs nothing, works without JS once rendered, and the numbers
 * are in the text so a screen reader gets them for free.
 *
 * CHANGES_20260819b.md §1 — the two chart primitives, `Sparkline` and
 * `DistributionBars`, were readable only by hovering (a native `title`
 * tooltip, invisible on a phone tap, which is most of how this dashboard
 * actually gets checked). Both now print their key numbers as visible text
 * by default; hover/tap only recovers *extra* detail (Sparkline's per-bar
 * date, a DistributionBars label that got truncated), never the only way to
 * see a number at all. `"use client"` only for `Sparkline`'s tap-or-hover
 * readout — everything else here stays as inert as before.
 */

/** "2026-05-27" -> "May 27" — deliberately month-first and yearless, for a
 *  chart caption rather than a full date; Singapore's calendar day is
 *  already baked into the key string, so no timezone math happens here. */
export function shortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Part 1 §E — a small, reusable "export what you're looking at" button.
 *  Client-side CSV generation only: the data driving the chart is already
 *  in hand, so there's nothing a server round-trip would add. */
export function ExportCsvButton({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, toCsv(headers, rows))}
      className="text-stone hover:text-ink inline-flex shrink-0 items-center gap-1 text-xs underline"
    >
      <DownloadIcon className="h-3 w-3" aria-hidden="true" />
      Export CSV
    </button>
  );
}

export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="border-line bg-cream/60 rounded-xl border p-3">
      <p className="text-ink text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-stone mt-0.5 text-xs">{label}</p>
      {sub && <p className="text-stone mt-0.5 text-[11px]">{sub}</p>}
    </div>
  );
}

/** A row of bars, one per bucket, height scaled to the series max. */
export function Sparkline({
  data,
  weekly,
  windowDays,
}: {
  data: DateCount[];
  /** Label buckets as week-starts rather than single days. */
  weekly?: boolean;
  /** The series' full trailing window (`AdminAnalytics.windowDays`) — every
   *  bucket here is the same fixed window, just daily or weekly. Used only
   *  for the range caption; `data` itself is sparse (a day/week with zero
   *  counts has no entry), so the window's true start would otherwise read
   *  later than it actually is whenever the window opens on a quiet day. */
  windowDays: number;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return <p className="text-stone text-xs">No data in this window yet.</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.count));
  const peakIndex = data.reduce(
    (best, d, i) => (d.count > data[best].count ? i : best),
    0
  );
  const latestIndex = data.length - 1;
  const active = activeIndex !== null ? data[activeIndex] : null;

  const windowStart = sgtToday();
  windowStart.setDate(windowStart.getDate() - (windowDays - 1));
  const windowStartKey = dateKey(windowStart);
  const windowEndKey = dateKey(sgtToday());

  return (
    <div>
      <div className="flex h-16 items-stretch gap-0.5">
        {data.map((point, index) => (
          <button
            key={point.date}
            type="button"
            className="group relative min-w-[3px] flex-1"
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
            onFocus={() => setActiveIndex(index)}
            onBlur={() => setActiveIndex(null)}
            aria-label={`${weekly ? "Week of " : ""}${point.date}: ${point.count}`}
          >
            <span
              className={cn(
                "group-hover:bg-ember group-focus:bg-ember absolute inset-x-0 bottom-0 rounded-t transition-colors",
                index === peakIndex || index === latestIndex
                  ? "bg-ember"
                  : "bg-ember/60"
              )}
              style={{ height: `${Math.max(4, (point.count / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-stone shrink-0">
          {shortDate(windowStartKey)} – {shortDate(windowEndKey)}
        </span>
        <span className="text-ink shrink-0 font-medium tabular-nums">
          {active
            ? `${shortDate(active.date)}: ${active.count}`
            : peakIndex === latestIndex
              ? `Now (peak): ${data[latestIndex].count}`
              : `Peak ${data[peakIndex].count} (${shortDate(data[peakIndex].date)}) · Now ${data[latestIndex].count}`}
        </span>
      </div>
    </div>
  );
}

export function RankedList({
  items,
  suffix = "",
  formatValue,
  linkTo,
}: {
  items: NamedCount[];
  suffix?: string;
  formatValue?: (item: NamedCount) => string;
  /** When given, each row's name becomes a link — the click-through into a
   *  per-item drill-down (Places §C today, Users §B later), reused here
   *  rather than each view rolling its own linked-row variant. */
  linkTo?: (item: NamedCount) => string;
}) {
  if (items.length === 0) {
    return <p className="text-stone text-xs">Nothing here yet.</p>;
  }

  return (
    <ol className="space-y-1.5">
      {items.map((item, index) => (
        <li
          key={item.id}
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span className="min-w-0 truncate">
            <span className="text-stone mr-2 text-xs">{index + 1}</span>
            {linkTo ? (
              <Link href={linkTo(item)} className="text-ember underline">
                {item.name}
              </Link>
            ) : (
              item.name
            )}
          </span>
          <span className="text-stone shrink-0 text-xs tabular-nums">
            {formatValue ? formatValue(item) : `${item.count}${suffix}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function DistributionBars({
  entries,
  formatLabel,
  formatValue,
  total,
}: {
  entries: [string, number][];
  formatLabel?: (key: string) => string;
  /** Formats each bar's own value and the "N total" line — defaults to the
   *  raw number, which is right for the two integer-count callers. Pass
   *  e.g. `(v) => \`${v}%\`` when `entries` holds percentage points rather
   *  than counts (a user's cuisine breakdown is a 0-1 share, not a count). */
  formatValue?: (value: number) => string;
  /**
   * Overrides the "N total" line's sum — pass the true, untruncated total
   * when `entries` has been sliced down (e.g. cuisine tags to the top 8).
   * Defaults to the sum of `entries` itself, which is already the true
   * total for the two callers that don't truncate.
   */
  total?: number;
}) {
  if (entries.length === 0) {
    return <p className="text-stone text-xs">No data yet.</p>;
  }
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const grandTotal = total ?? entries.reduce((sum, [, v]) => sum + v, 0);
  const fmt = formatValue ?? ((v: number) => `${v}`);

  return (
    <div>
      {/* One consistent color everywhere, not per-row cycling — nothing in
          this data maps to color as a second dimension, so cycling through
          decorative hues was answering a question ("what does this color
          mean?") that a single hue removes instead. */}
      <div className="text-stone mb-1 flex justify-between text-[10px] tabular-nums">
        <span>0</span>
        <span>{max}</span>
      </div>
      <ul className="space-y-2">
        {entries.map(([key, value]) => {
          const label = formatLabel ? formatLabel(key) : key;
          return (
            <li key={key} className="flex items-center gap-3 text-xs">
              <span
                className="text-stone w-24 shrink-0 truncate"
                title={label}
              >
                {label}
              </span>
              <span className="bg-paper h-3 flex-1 overflow-hidden rounded-full">
                <span
                  className="bg-ember/70 block h-full rounded-full"
                  style={{ width: `${Math.max(3, (value / max) * 100)}%` }}
                />
              </span>
              <span className="text-stone w-8 shrink-0 text-right tabular-nums">
                {fmt(value)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-stone mt-2 text-[11px] tabular-nums">
        {fmt(grandTotal)} total
      </p>
    </div>
  );
}

/** Weekly average rating over time (Part 1 §C) — fixed 0-5 scale, unlike
 *  `DistributionBars`' locally-scaled max, since a rating trend needs to
 *  read against the actual 1-5 scale rather than its own history's peak. */
export function RatingTrend({
  data,
}: {
  data: { date: string; avgRating: number; count: number }[];
}) {
  if (data.length === 0) {
    return <p className="text-stone text-xs">No rated visits yet.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {data.map((point) => (
        <li key={point.date} className="flex items-center gap-3 text-xs">
          <span className="text-stone w-16 shrink-0">{shortDate(point.date)}</span>
          <span className="bg-paper h-3 flex-1 overflow-hidden rounded-full">
            <span
              className="bg-ember/70 block h-full rounded-full"
              style={{ width: `${Math.max(3, (point.avgRating / 5) * 100)}%` }}
            />
          </span>
          <span className="text-ink w-16 shrink-0 text-right tabular-nums">
            {point.avgRating.toFixed(1)} ({point.count})
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FunnelSection({ funnel }: { funnel: AdminAnalytics["funnel"] }) {
  return (
    <Card className="space-y-3">
      <SectionHeading>Participation funnel — today</SectionHeading>
      <p className="text-stone text-xs">
        DAU (anyone who opened the app, whether or not they did anything)
        isn't queryable from here — see{" "}
        <span className="font-medium">Performance</span> below for the
        Vercel Analytics link.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Participating DAU"
          value={funnel.participatingDau}
          sub="any write today"
        />
        <StatTile
          label="Voted in a Jio"
          value={funnel.votedInJioToday}
          sub="today"
        />
        <StatTile
          label="Hosted a Jio"
          value={funnel.hostedJioToday}
          sub="today"
        />
      </div>
      <p className="text-stone text-xs">
        Responded to an invite (RSVP'd): {funnel.respondedToInviteTotal}{" "}
        lifetime — <code>event_rsvps</code> has no timestamp column yet, so
        this can't be split into "today" like the others.
      </p>
    </Card>
  );
}

const FUNNEL_STEP_LABEL: Record<AdminAnalytics["funnelSteps"]["steps"][number]["step"], string> = {
  invited: "Invited",
  responded: "Responded",
  voted: "Voted",
  attended: "Attended",
  reviewed: "Reviewed",
};

/** The real step funnel (Part 1 §D) — a shared population of invite-
 *  instances across every decided Jio in the window, each step a strict
 *  subset of the one before, with real drop-off percentages. Distinct from
 *  `FunnelSection` above, which is a same-day activity snapshot with no
 *  shared population and nothing to drop off between. */
export function FunnelStepsSection({
  funnelSteps,
  windowDays,
  appliedSegmentLabel,
}: {
  funnelSteps: AdminAnalytics["funnelSteps"];
  windowDays: number;
  /** Part 1 §E — when set, this funnel is restricted to participants in
   *  Jios hosted by this segment's members. */
  appliedSegmentLabel?: string | null;
}) {
  const { steps, trend, cohortBySignupWeek } = funnelSteps;
  const invited = steps[0]?.count ?? 0;

  return (
    <Card className="space-y-4">
      <SectionHeading>Real funnel — decided Jios</SectionHeading>
      {appliedSegmentLabel && (
        <p className="text-ember text-xs font-medium">
          Filtered to Jios hosted by: {appliedSegmentLabel}
        </p>
      )}
      <p className="text-stone text-xs">
        Every Jio that closed with a winner in this window, and everyone
        invited to one — one shared population carried step by step, unlike
        the same-day snapshot above. "Reviewed" is an approximation: a visit
        to the winning place at or after the Jio closed, since visits aren't
        linked to which Jio prompted them.
      </p>

      {invited === 0 ? (
        <p className="text-stone text-xs">No decided Jios in this window yet.</p>
      ) : (
        <ul className="space-y-2">
          {steps.map((s, i) => {
            const pctOfInvited = invited > 0 ? Math.round((s.count / invited) * 100) : 0;
            const prev = i > 0 ? steps[i - 1].count : null;
            const pctOfPrev =
              prev && prev > 0 ? Math.round((s.count / prev) * 100) : null;
            return (
              <li key={s.step} className="flex items-center gap-3 text-xs">
                <span className="text-stone w-20 shrink-0">
                  {FUNNEL_STEP_LABEL[s.step]}
                </span>
                <span className="bg-paper h-3 flex-1 overflow-hidden rounded-full">
                  <span
                    className="bg-ember/70 block h-full rounded-full"
                    style={{ width: `${Math.max(3, pctOfInvited)}%` }}
                  />
                </span>
                <span className="text-ink w-10 shrink-0 text-right tabular-nums">
                  {s.count}
                </span>
                <span className="text-stone w-24 shrink-0 text-right tabular-nums">
                  {pctOfInvited}% of invited
                  {pctOfPrev !== null && i > 0 && ` · ${pctOfPrev}% of prev`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="text-ink text-sm font-medium">Invited per week</p>
          <Sparkline data={trend.invitedPerWeek} weekly windowDays={windowDays} />
        </div>
        <div>
          <p className="text-ink text-sm font-medium">Responded per week</p>
          <Sparkline data={trend.respondedPerWeek} weekly windowDays={windowDays} />
        </div>
        <div>
          <p className="text-ink text-sm font-medium">Voted per week</p>
          <Sparkline data={trend.votedPerWeek} weekly windowDays={windowDays} />
        </div>
        <div>
          <p className="text-ink text-sm font-medium">Attended per week</p>
          <Sparkline data={trend.attendedPerWeek} weekly windowDays={windowDays} />
        </div>
        <div>
          <p className="text-ink text-sm font-medium">Reviewed per week</p>
          <Sparkline data={trend.reviewedPerWeek} weekly windowDays={windowDays} />
        </div>
      </div>

      <div>
        <p className="text-ink text-sm font-medium">Cohort by signup week</p>
        {cohortBySignupWeek.length === 0 ? (
          <p className="text-stone mt-1 text-xs">
            No participant in a decided Jio has a recorded signup week yet.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-xs">
              <thead>
                <tr className="text-stone text-left">
                  <th className="pb-1 pr-2 font-medium">Signed up</th>
                  <th className="pb-1 pr-2 text-right font-medium">Invited</th>
                  <th className="pb-1 pr-2 text-right font-medium">Responded</th>
                  <th className="pb-1 pr-2 text-right font-medium">Voted</th>
                  <th className="pb-1 pr-2 text-right font-medium">Attended</th>
                  <th className="pb-1 text-right font-medium">Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {cohortBySignupWeek.map((row) => (
                  <tr key={row.weekStart} className="border-line border-t">
                    <td className="text-ink py-1 pr-2">{shortDate(row.weekStart)}</td>
                    <td className="text-ink py-1 pr-2 text-right tabular-nums">
                      {row.invited}
                    </td>
                    <td className="text-ink py-1 pr-2 text-right tabular-nums">
                      {row.responded}
                    </td>
                    <td className="text-ink py-1 pr-2 text-right tabular-nums">
                      {row.voted}
                    </td>
                    <td className="text-ink py-1 pr-2 text-right tabular-nums">
                      {row.attended}
                    </td>
                    <td className="text-ink py-1 text-right tabular-nums">
                      {row.reviewed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function dateCountRows(series: DateCount[]): [string, number][] {
  return series.map((d) => [d.date, d.count]);
}

export function GrowthSection({
  growth,
  windowDays,
}: {
  growth: AdminAnalytics["growth"];
  windowDays: number;
}) {
  const sum = (series: DateCount[]) => series.reduce((a, b) => a + b.count, 0);
  return (
    <Card className="space-y-4">
      <SectionHeading>Growth</SectionHeading>

      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-ink text-sm font-medium">
            New users — {sum(growth.newUsersPerDay)} in window
          </p>
          <ExportCsvButton
            filename="new-users-per-day.csv"
            headers={["date", "count"]}
            rows={dateCountRows(growth.newUsersPerDay)}
          />
        </div>
        <Sparkline data={growth.newUsersPerDay} windowDays={windowDays} />
        {growth.newUsersDetail.length > 0 && (
          <details className="mt-1">
            <summary className="text-stone cursor-pointer text-[11px]">
              Who joined — day by day
            </summary>
            <ul className="mt-1 space-y-1">
              {growth.newUsersDetail.map((day) => (
                <li key={day.date} className="text-stone text-[11px]">
                  <span className="text-ink font-medium">{shortDate(day.date)}:</span>{" "}
                  {day.users.map((u) => u.name).join(", ")}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-ink text-sm font-medium">
            Jios created — {sum(growth.jiosCreatedPerDay)} in window
          </p>
          <ExportCsvButton
            filename="jios-created-per-day.csv"
            headers={["date", "count"]}
            rows={dateCountRows(growth.jiosCreatedPerDay)}
          />
        </div>
        <Sparkline data={growth.jiosCreatedPerDay} windowDays={windowDays} />
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-ink text-sm font-medium">
            Places added — {sum(growth.placesAddedPerDay)} in window
          </p>
          <ExportCsvButton
            filename="places-added-per-day.csv"
            headers={["date", "count"]}
            rows={dateCountRows(growth.placesAddedPerDay)}
          />
        </div>
        <Sparkline data={growth.placesAddedPerDay} windowDays={windowDays} />
        <p className="text-stone mt-1 text-[11px]">
          Any path (via a Jio or /places/new) — the schema doesn't record
          which one a place came through.
        </p>
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-ink text-sm font-medium">
            Kaki groups created — {sum(growth.kakiGroupsCreatedPerDay)} in
            window, {growth.kakiGroupsCumulative} total
          </p>
          <ExportCsvButton
            filename="kaki-groups-created-per-day.csv"
            headers={["date", "count"]}
            rows={dateCountRows(growth.kakiGroupsCreatedPerDay)}
          />
        </div>
        <Sparkline
          data={growth.kakiGroupsCreatedPerDay}
          windowDays={windowDays}
        />
      </div>
    </Card>
  );
}

/**
 * Daily Activity Log — who visited the app on each of the last 7 days,
 * regardless of whether they did anything else. Always the trailing
 * week, unaffected by the window/segment picker — same "today, not the
 * window" reasoning `FunnelSection` uses. Same `<details>` disclosure
 * pattern as `GrowthSection`'s "Who joined."
 */
export function RecentEntrantsSection({
  recentEntrants,
}: {
  recentEntrants: AdminAnalytics["recentEntrants"];
}) {
  const totalVisits = recentEntrants.reduce((sum, day) => sum + day.users.length, 0);

  return (
    <Card className="space-y-2">
      <SectionHeading>Recent entrants</SectionHeading>
      <p className="text-stone text-sm">
        {totalVisits} visit{totalVisits === 1 ? "" : "s"} across the last 7 days
      </p>
      {recentEntrants.length === 0 ? (
        <p className="text-stone text-sm">Nobody's visited in the last 7 days.</p>
      ) : (
        <ul className="space-y-1">
          {recentEntrants.map((day) => (
            <li key={day.date} className="text-stone text-[11px]">
              <span className="text-ink font-medium">{shortDate(day.date)}:</span>{" "}
              {day.users
                .map((u) => (u.pageViews > 1 ? `${u.name} (${u.pageViews})` : u.name))
                .join(", ")}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function JioOutcomesSection({
  outcomes,
  appliedSegmentLabel,
}: {
  outcomes: AdminAnalytics["jioOutcomes"];
  /** Part 1 §E — when set, these numbers are restricted to Jios hosted by
   *  this segment's members rather than everyone. */
  appliedSegmentLabel?: string | null;
}) {
  return (
    <Card className="space-y-3">
      <SectionHeading>Jio outcomes</SectionHeading>
      {appliedSegmentLabel && (
        <p className="text-ember text-xs font-medium">
          Filtered to Jios hosted by: {appliedSegmentLabel}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Decided" value={outcomes.decided} />
        <StatTile label="Closed, no winner" value={outcomes.closedNoWinner} />
        <StatTile label="Cancelled" value={outcomes.cancelled} />
        <StatTile label="Still open" value={outcomes.stillOpen} />
      </div>
      <p className="text-stone text-xs">
        {outcomes.avgBallotsPerJio.toFixed(1)} average ballots per Jio ·{" "}
        {outcomes.medianTimeToDecisionHours === null
          ? "no closed Jio with a recorded close time yet"
          : `${outcomes.medianTimeToDecisionHours.toFixed(1)}h median time to decision`}
      </p>
    </Card>
  );
}

export function ContentSection({
  content,
}: {
  content: AdminAnalytics["content"];
}) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-2">
          <SectionHeading>Top-rated places</SectionHeading>
          <ExportCsvButton
            filename="top-rated-places.csv"
            headers={["name", "avgRating", "visits"]}
            rows={content.topRatedPlaces.map((p) => [p.name, p.avgRating, p.count])}
          />
        </div>
        <p className="text-stone mb-2 text-xs">
          At least 3 visits, so one glowing review can't sit at the top.
        </p>
        <RankedList
          items={content.topRatedPlaces.map((p) => ({
            id: p.id,
            name: p.name,
            count: p.count,
          }))}
          formatValue={(item) => {
            const rated = content.topRatedPlaces.find((p) => p.id === item.id);
            return `${rated?.avgRating.toFixed(1)} · ${item.count} visits`;
          }}
          linkTo={(item) => `/admin/analytics/places/${item.id}`}
        />
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2">
          <SectionHeading>Most-visited places</SectionHeading>
          <ExportCsvButton
            filename="most-visited-places.csv"
            headers={["name", "visits"]}
            rows={content.mostVisitedPlaces.map((p) => [p.name, p.count])}
          />
        </div>
        <RankedList
          items={content.mostVisitedPlaces}
          suffix=" visits"
          linkTo={(item) => `/admin/analytics/places/${item.id}`}
        />
      </Card>

      <Card>
        <SectionHeading>Cuisine tags</SectionHeading>
        <DistributionBars
          entries={Object.entries(content.cuisineDistribution).sort(
            (a, b) => b[1] - a[1]
          ).slice(0, 8)}
          formatLabel={formatCuisine}
          total={Object.values(content.cuisineDistribution).reduce(
            (sum, v) => sum + v,
            0
          )}
        />
        <p className="text-stone mt-2 text-xs">
          {content.customCuisineTagUsageCount} custom "Other" tags in use —
          display-only, not counted above since they never affect scoring.
        </p>
      </Card>

      <Card>
        <SectionHeading>Walk time</SectionHeading>
        <DistributionBars
          entries={content.walkTimeBuckets.map((b) => [b.bucket, b.count])}
        />
      </Card>
    </div>
  );
}

export function SocialSection({ social }: { social: AdminAnalytics["social"] }) {
  return (
    <div className="space-y-4">
      <Card>
        <SectionHeading>Most active Kaki groups</SectionHeading>
        <p className="text-stone mb-2 text-xs">By Jios hosted through the group.</p>
        <RankedList items={social.mostActiveKakis} suffix=" Jios" />
      </Card>
      <Card>
        <SectionHeading>Group size</SectionHeading>
        <DistributionBars
          entries={social.groupSizeDistribution.map((d) => [
            `${d.size} member${d.size === 1 ? "" : "s"}`,
            d.count,
          ])}
        />
      </Card>
    </div>
  );
}

export function ModerationSection({
  moderation,
  windowDays,
}: {
  moderation: AdminAnalytics["moderation"];
  windowDays: number;
}) {
  return (
    <Card className="space-y-4">
      <SectionHeading>Moderation</SectionHeading>
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Pending reports" value={moderation.pendingCount} />
        <StatTile
          label="Avg. resolution time"
          value={
            moderation.avgResolutionHours === null
              ? "—"
              : `${moderation.avgResolutionHours.toFixed(1)}h`
          }
        />
      </div>
      <div>
        <p className="text-ink text-sm font-medium">Filed per week</p>
        <Sparkline
          data={moderation.reportsFiledPerWeek}
          weekly
          windowDays={windowDays}
        />
      </div>
      <div>
        <p className="text-ink text-sm font-medium">Resolved per week</p>
        <Sparkline
          data={moderation.reportsResolvedPerWeek}
          weekly
          windowDays={windowDays}
        />
      </div>
    </Card>
  );
}

export function WishlistSection({
  wishlist,
  windowDays,
}: {
  wishlist: AdminAnalytics["wishlist"];
  windowDays: number;
}) {
  return (
    <Card className="space-y-4">
      <SectionHeading>Wishlist</SectionHeading>
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-ink text-sm font-medium">Saves per week</p>
          <ExportCsvButton
            filename="wishlist-saves-per-week.csv"
            headers={["weekStart", "count"]}
            rows={dateCountRows(wishlist.savesPerWeek)}
          />
        </div>
        <Sparkline data={wishlist.savesPerWeek} weekly windowDays={windowDays} />
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-ink text-sm font-medium">Most saved</p>
          <ExportCsvButton
            filename="most-saved-places.csv"
            headers={["name", "saves"]}
            rows={wishlist.mostSavedPlaces.map((p) => [p.name, p.count])}
          />
        </div>
        <RankedList items={wishlist.mostSavedPlaces} suffix=" saves" />
      </div>
    </Card>
  );
}

/** Last bucket's count, 0 for an empty series — "how many people were
 *  active in the most recent complete-ish bucket," not a lifetime total. */
function latest(series: DateCount[]): number {
  return series.length > 0 ? series[series.length - 1].count : 0;
}

export function PerformanceSection({
  performance,
  windowDays,
}: {
  performance: AdminAnalytics["performance"];
  windowDays: number;
}) {
  return (
    <Card className="space-y-4">
      <SectionHeading>Performance</SectionHeading>
      <p className="text-stone text-xs">
        In-app usage — distinct people who did anything (voted, hosted,
        logged a visit, saved a wishlist item, added a place, or filed a
        report), the same "active" definition as the funnel above, tracked
        as a trend instead of just today.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="DAU" value={latest(performance.dauPerDay)} sub="latest day" />
        <StatTile label="WAU" value={latest(performance.wauPerWeek)} sub="latest week" />
        <StatTile label="MAU" value={latest(performance.mauPerMonth)} sub="latest month" />
      </div>

      <div>
        <p className="text-ink text-sm font-medium">Daily active users</p>
        <Sparkline data={performance.dauPerDay} windowDays={windowDays} />
      </div>
      <div>
        <p className="text-ink text-sm font-medium">Weekly active users</p>
        <Sparkline data={performance.wauPerWeek} weekly windowDays={windowDays} />
      </div>
      <div>
        <p className="text-ink text-sm font-medium">Monthly active users</p>
        <Sparkline data={performance.mauPerMonth} windowDays={windowDays} />
      </div>

      <div className="border-line border-t pt-3">
        <p className="text-stone text-xs">
          Page views, unique visitors, and Core Web Vitals live in Vercel's
          own dashboard instead — free-tier metering (Supabase egress/DB
          size, Vercel Active CPU) is platform data this app's own database
          can't query either, so both link out rather than trying to
          replicate them.
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="text-ember underline"
          >
            Vercel Analytics →
          </a>
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="text-ember underline"
          >
            Supabase usage →
          </a>
        </div>
      </div>
    </Card>
  );
}
