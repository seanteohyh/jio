import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { config, features } from "@/lib/config";
import StartJioWizard from "@/components/home/StartJioWizard";
import NeedsAvailability from "@/components/home/NeedsAvailability";
import StreakBanner from "@/components/home/StreakBanner";
import { LinkButton } from "@/components/ui";
import JioLockup from "@/components/brand/JioLockup";
import { formatTime, relativeDayLabel } from "@/lib/utils";
import type { LunchEvent } from "@/types";

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 11) return "Morning";
  if (hour < 15) return "Lunchtime";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

const DOT_COLOR: Record<LunchEvent["status"], string> = {
  open: "bg-ember",
  closed: "bg-sage",
  cancelled: "bg-stone",
};

/** Mon–Sun of the week containing `now`, as local midnight Dates. */
function currentWeek(now: Date): Date[] {
  const day = now.getDay(); // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Resolve the display name server-side so the greeting does not flash.
  let name = user.display_name ?? user.email?.split("@")[0] ?? "there";
  let profile = null;
  let events: LunchEvent[] = [];
  try {
    const repo = await getRepoAsync();
    profile = await repo.getProfile(user.id);
    if (features.events) {
      // Lazy generation: loading Home is one of the two places (with the
      // Jios list) that triggers a host's recurring series to generate its
      // next occurrence. See 031_recurring_series.sql.
      await repo.generateDueOccurrences(user.id);
      events = await repo.listEvents(user.id);
    }
  } catch {
    // Fall back to whatever we already have.
  }

  // redirect() throws internally, so it must never sit inside the try/catch
  // above — a catch there would swallow the redirect itself.
  if (profile) {
    name = profile.display_name;
    if (!profile.onboarded_at) redirect("/welcome");
  }

  const now = new Date();

  // Home = quick action dashboard, not a second copy of the Jios tab (that
  // duplication was the actual source of "Home and Jios feel too similar" —
  // decided 1 Aug, CHANGES_20260801.md §10). It keeps at most one forward-
  // looking Jio: today's, as the headline itself, or otherwise the single
  // next one — never a list.
  const relevantOpen = events.filter(
    (e) => e.status === "open" && e.date_phase !== "polling"
  );
  const todaysJio = relevantOpen.find((e) =>
    isSameDay(new Date(e.scheduled_at), now)
  );
  const nextJio = todaysJio
    ? undefined
    : relevantOpen
        .filter((e) => new Date(e.scheduled_at).getTime() > now.getTime())
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];

  const week = currentWeek(now);
  const weekDots = week.map((day) => ({
    day,
    event: events.find(
      (e) => e.date_phase !== "polling" && isSameDay(new Date(e.scheduled_at), day)
    ),
  }));

  // "Same as last time?" — one-tap repeat. Scoped to Jios *you* hosted: only
  // a host can meaningfully repeat "who / where / when."
  const lastHosted = events
    .filter((e) => e.host_id === user.id && e.status !== "open")
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))[0];

  return (
    <div className="space-y-6">
      {/* The lockup only appears on Home. Everywhere else the side rail or the
          page title carries the identity, and repeating it would be noise. */}
      <JioLockup className="md:hidden" size="sm" beta={config.isDemo} />

      <header>
        <p className="text-stone text-sm">
          {greeting()}, {name}.
        </p>
        {todaysJio ? (
          <>
            <h1 className="font-display text-ink mt-1 text-4xl leading-[1.05] font-bold tracking-tight">
              {todaysJio.title}
            </h1>
            <p className="text-stone mt-2 text-sm">
              Today, {formatTime(todaysJio.scheduled_at)}
              {todaysJio.host_name && ` · hosted by ${todaysJio.host_name}`}
              {typeof todaysJio.going_count === "number" &&
                todaysJio.going_count > 0 &&
                ` · ${todaysJio.going_count} going`}
            </p>
            <Link
              href={`/events/${todaysJio.id}`}
              className="text-ember mt-2 inline-block text-sm underline"
            >
              View the Jio
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-display text-ink mt-1 text-4xl leading-[1.05] font-bold tracking-tight">
              What&rsquo;s for lunch?
            </h1>
            <p className="text-stone mt-2 text-sm">
              Pick somewhere, or let the votes decide.
            </p>
          </>
        )}
      </header>

      {features.metrics && <StreakBanner />}

      <div className="flex flex-col gap-2 sm:flex-row">
        {features.events ? (
          <div className="flex-1">
            <StartJioWizard />
          </div>
        ) : null}
        <LinkButton href="/suggest" variant="secondary" className="flex-1">
          Just tell me where to go
        </LinkButton>
      </div>

      {features.events && lastHosted && (
        <Link
          href={`/events/new?repeatFrom=${lastHosted.id}`}
          className="text-ember text-xs underline"
        >
          Same as last time? Start a Jio like &ldquo;{lastHosted.title}
          &rdquo;
        </Link>
      )}

      {features.events && (
        <div className="flex items-center justify-between gap-1">
          {weekDots.map(({ day, event }) => (
            <Link
              key={day.toISOString()}
              href={event ? `/events/${event.id}` : "/events"}
              className="flex flex-1 flex-col items-center gap-1 py-1"
            >
              <span className="text-stone text-[10px] font-medium uppercase">
                {day.toLocaleDateString("en-SG", { weekday: "narrow" })}
              </span>
              <span
                className={
                  isSameDay(day, now)
                    ? "border-ember flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold"
                    : "flex h-6 w-6 items-center justify-center text-[11px]"
                }
              >
                {day.getDate()}
              </span>
              <span
                aria-hidden="true"
                className={
                  event
                    ? `h-1.5 w-1.5 rounded-full ${DOT_COLOR[event.status]}`
                    : "h-1.5 w-1.5"
                }
              />
            </Link>
          ))}
        </div>
      )}

      {features.events && nextJio && (
        <Link
          href={`/events/${nextJio.id}`}
          className="border-line bg-cream/60 hover:border-ember/40 block rounded-xl border p-3 transition-colors"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{nextJio.title}</span>
            <span className="text-stone shrink-0 text-xs">
              {relativeDayLabel(nextJio.scheduled_at)} ·{" "}
              {formatTime(nextJio.scheduled_at)}
            </span>
          </div>
          <p className="text-stone mt-1 text-xs">
            {nextJio.option_count ?? 0} option
            {nextJio.option_count === 1 ? "" : "s"}
            {typeof nextJio.going_count === "number" &&
              nextJio.going_count > 0 &&
              ` · ${nextJio.going_count} going`}
            {nextJio.host_name && ` · hosted by ${nextJio.host_name}`}
          </p>
        </Link>
      )}

      {features.events && <NeedsAvailability />}
    </div>
  );
}
