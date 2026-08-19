import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { config, features } from "@/lib/config";
import StartJioWizard from "@/components/home/StartJioWizard";
import NeedsAvailability from "@/components/home/NeedsAvailability";
import StreakBanner from "@/components/home/StreakBanner";
import EventRow from "@/components/events/EventRow";
import AddToHomeScreenCard from "@/components/profile/AddToHomeScreenCard";
import HintCard from "@/components/HintCard";
import { LinkButton, SectionHeading } from "@/components/ui";
import JioLockup from "@/components/brand/JioLockup";
import { formatTime, isSameSgtDay } from "@/lib/utils";
import type { LunchEvent } from "@/types";

/** CHANGES_20260819.md §1 — how long a fresh account still counts as
 *  "newer" for the inline home-screen nudge below Upcoming. */
const NEW_USER_WINDOW_DAYS = 14;

/**
 * Needs the hour *in Singapore*, not whatever timezone is running the code
 * — Home is the app's one Server Component, so this runs during SSR on
 * Vercel's UTC clock, not the visitor's phone (CHANGES_20260818.md §4).
 * `isSameSgtDay` below (imported from utils.ts) is the same fix for the
 * "is this today's Jio" check just below.
 */
function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-SG", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Singapore",
    }).format(now)
  );
  if (hour < 11) return "Morning";
  if (hour < 15) return "Lunchtime";
  if (hour < 18) return "Afternoon";
  return "Evening";
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
    // The profile fetch doesn't depend on events (or vice versa) — run them
    // together rather than as a four-deep sequential waterfall, which was
    // stacking up real round-trip latency on every Home load.
    const [profileResult, eventsResult] = await Promise.all([
      repo.getProfile(user.id),
      features.events
        ? // Lazy generation: loading Home is one of the two places (with
          // the Jios list) that triggers a host's recurring series to
          // generate its next occurrence. See 031_recurring_series.sql.
          // Has to stay sequential with listEvents — a newly generated
          // occurrence needs to exist before it can be listed.
          repo
            .generateDueOccurrences(user.id)
            .then(() => repo.listEvents(user.id))
        : Promise.resolve([]),
    ]);
    profile = profileResult;
    events = eventsResult;
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
  // decided 1 Aug, CHANGES_20260801.md §10). Today's Jio, if any, is the
  // headline itself; below it sits a short, capped list of what's coming
  // next — the Mon-Fri dot strip this replaces (3 Aug) read as a miniature
  // calendar competing with the Jios tab's actual one, and screenshotted
  // back poorly. Capped at 2 so this stays a glance, not a second full
  // browsable list — that stays on Jios.
  const relevantOpen = events.filter(
    (e) => e.status === "open" && e.date_phase !== "polling"
  );
  const todaysJio = relevantOpen.find((e) => isSameSgtDay(e.scheduled_at, now));
  const upcomingList = relevantOpen
    .filter((e) => e.id !== todaysJio?.id)
    .filter((e) => new Date(e.scheduled_at).getTime() > now.getTime())
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .slice(0, 2);

  // "Same as last time?" — one-tap repeat. Scoped to Jios *you* hosted: only
  // a host can meaningfully repeat "who / where / when."
  const lastHosted = events
    .filter((e) => e.host_id === user.id && e.status !== "open")
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))[0];

  const isNewerUser =
    !!profile?.created_at &&
    now.getTime() - new Date(profile.created_at).getTime() <
      NEW_USER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

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

      <HintCard page="home" icon="🍜">
        Start a Jio to vote with the group, or tap &ldquo;Just tell me where
        to go&rdquo; for an instant pick with no voting.
      </HintCard>

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

      {features.events && upcomingList.length > 0 && (
        <div className="space-y-2">
          <SectionHeading action={<Link href="/events" className="text-ember text-xs underline">See all</Link>}>
            Upcoming
          </SectionHeading>
          <ul className="space-y-2">
            {upcomingList.map((event) => (
              <li key={event.id}>
                <EventRow event={event} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {isNewerUser && <AddToHomeScreenCard standalone />}

      {features.events && <NeedsAvailability />}
    </div>
  );
}
