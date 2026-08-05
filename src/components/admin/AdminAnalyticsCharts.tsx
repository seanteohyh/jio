import { Card, SectionHeading } from "@/components/ui";
import { formatCuisine } from "@/lib/utils";
import type { AdminAnalytics, DateCount, NamedCount } from "@/types";

/**
 * §13 admin analytics dashboard — presentational pieces.
 *
 * Same rendering philosophy as `MetricsCharts.tsx`: proportional widths on
 * styled `div`s, not a charting library, for a handful of bars and a
 * sparkline. Costs nothing, works without JS once rendered, and the numbers
 * are in the text so a screen reader gets them for free.
 */

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
}: {
  data: DateCount[];
  /** Label buckets as week-starts rather than single days. */
  weekly?: boolean;
}) {
  if (data.length === 0) {
    return <p className="text-stone text-xs">No data in this window yet.</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="flex h-16 items-end gap-0.5">
      {data.map((point) => (
        <div
          key={point.date}
          className="bg-ember/70 min-w-[3px] flex-1 rounded-t"
          style={{ height: `${Math.max(4, (point.count / max) * 100)}%` }}
          title={`${weekly ? "Week of " : ""}${point.date}: ${point.count}`}
        />
      ))}
    </div>
  );
}

export function RankedList({
  items,
  suffix = "",
  formatValue,
}: {
  items: NamedCount[];
  suffix?: string;
  formatValue?: (item: NamedCount) => string;
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
            {item.name}
          </span>
          <span className="text-stone shrink-0 text-xs tabular-nums">
            {formatValue ? formatValue(item) : `${item.count}${suffix}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

const BAR_COLORS = [
  "#b4532f",
  "#567b57",
  "#a87b2d",
  "#6b6091",
  "#3f6b78",
  "#8c4a52",
  "#427a70",
];

export function DistributionBars({
  entries,
  formatLabel,
}: {
  entries: [string, number][];
  formatLabel?: (key: string) => string;
}) {
  if (entries.length === 0) {
    return <p className="text-stone text-xs">No data yet.</p>;
  }
  const max = Math.max(1, ...entries.map(([, v]) => v));

  return (
    <ul className="space-y-2">
      {entries.map(([key, value], index) => (
        <li key={key} className="flex items-center gap-3 text-xs">
          <span className="text-stone w-24 shrink-0 truncate">
            {formatLabel ? formatLabel(key) : key}
          </span>
          <span className="bg-paper h-3 flex-1 overflow-hidden rounded-full">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.max(3, (value / max) * 100)}%`,
                backgroundColor: BAR_COLORS[index % BAR_COLORS.length],
              }}
            />
          </span>
          <span className="text-stone w-8 shrink-0 text-right tabular-nums">
            {value}
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

export function GrowthSection({ growth }: { growth: AdminAnalytics["growth"] }) {
  const sum = (series: DateCount[]) => series.reduce((a, b) => a + b.count, 0);
  return (
    <Card className="space-y-4">
      <SectionHeading>Growth</SectionHeading>

      <div>
        <p className="text-ink text-sm font-medium">
          New users — {sum(growth.newUsersPerDay)} in window
        </p>
        <Sparkline data={growth.newUsersPerDay} />
      </div>
      <div>
        <p className="text-ink text-sm font-medium">
          Jios created — {sum(growth.jiosCreatedPerDay)} in window
        </p>
        <Sparkline data={growth.jiosCreatedPerDay} />
      </div>
      <div>
        <p className="text-ink text-sm font-medium">
          Places added — {sum(growth.placesAddedPerDay)} in window
        </p>
        <Sparkline data={growth.placesAddedPerDay} />
        <p className="text-stone mt-1 text-[11px]">
          Any path (via a Jio or /places/new) — the schema doesn't record
          which one a place came through.
        </p>
      </div>
      <div>
        <p className="text-ink text-sm font-medium">
          Kaki groups created — {sum(growth.kakiGroupsCreatedPerDay)} in
          window, {growth.kakiGroupsCumulative} total
        </p>
        <Sparkline data={growth.kakiGroupsCreatedPerDay} />
      </div>
    </Card>
  );
}

export function JioOutcomesSection({
  outcomes,
}: {
  outcomes: AdminAnalytics["jioOutcomes"];
}) {
  return (
    <Card className="space-y-3">
      <SectionHeading>Jio outcomes</SectionHeading>
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
        <SectionHeading>Top-rated places</SectionHeading>
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
        />
      </Card>

      <Card>
        <SectionHeading>Most-visited places</SectionHeading>
        <RankedList items={content.mostVisitedPlaces} suffix=" visits" />
      </Card>

      <Card>
        <SectionHeading>Cuisine tags</SectionHeading>
        <DistributionBars
          entries={Object.entries(content.cuisineDistribution).sort(
            (a, b) => b[1] - a[1]
          ).slice(0, 8)}
          formatLabel={formatCuisine}
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
}: {
  moderation: AdminAnalytics["moderation"];
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
        <Sparkline data={moderation.reportsFiledPerWeek} weekly />
      </div>
      <div>
        <p className="text-ink text-sm font-medium">Resolved per week</p>
        <Sparkline data={moderation.reportsResolvedPerWeek} weekly />
      </div>
    </Card>
  );
}

export function WishlistSection({
  wishlist,
}: {
  wishlist: AdminAnalytics["wishlist"];
}) {
  return (
    <Card className="space-y-4">
      <SectionHeading>Wishlist</SectionHeading>
      <div>
        <p className="text-ink text-sm font-medium">Saves per week</p>
        <Sparkline data={wishlist.savesPerWeek} weekly />
      </div>
      <RankedList items={wishlist.mostSavedPlaces} suffix=" saves" />
    </Card>
  );
}

export function PerformanceSection() {
  return (
    <Card className="space-y-2">
      <SectionHeading>Performance</SectionHeading>
      <p className="text-stone text-xs">
        Page views, unique visitors, DAU and Core Web Vitals live in
        Vercel's own dashboards — free-tier metering (Supabase egress/DB
        size, Vercel Active CPU) is platform data this app's own database
        can't query, so this links out rather than trying to replicate it.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
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
    </Card>
  );
}
