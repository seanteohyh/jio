import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { config, features } from "@/lib/config";
import StartJioWizard from "@/components/home/StartJioWizard";
import NeedsAvailability from "@/components/home/NeedsAvailability";
import UnseenLobangCard from "@/components/home/UnseenLobangCard";
import StreakBanner from "@/components/home/StreakBanner";
import AddToHomeScreenCard from "@/components/profile/AddToHomeScreenCard";
import HintCard from "@/components/HintCard";
import { LinkButton } from "@/components/ui";
import JioLockup from "@/components/brand/JioLockup";
import JioMark from "@/components/brand/JioMark";
import { JiosIcon, YouIcon } from "@/components/icons";
import { formatTime, isSameSgtDay, relativeDayLabel } from "@/lib/utils";
import type { InviteSelection } from "@/components/InvitePicker";
import {
  buildFirstHostInvite,
  pickFirstHostSourceEvent,
} from "@/lib/firstHostInvite";
import type { LunchEvent } from "@/types";

/** CHANGES_20260819.md §1 — how long a fresh account still counts as
 *  "newer" for the inline home-screen nudge below Upcoming. */
const NEW_USER_WINDOW_DAYS = 14;

/**
 * "Friday · 11:42am" — the small date/time line at the top of the hero
 * block (UX review log #23's redesign). Needs the day *in Singapore*, not
 * whatever timezone is running the code — Home is the app's one Server
 * Component, so this runs during SSR on Vercel's UTC clock, not the
 * visitor's phone (CHANGES_20260818.md §4). `isSameSgtDay` below (imported
 * from utils.ts) is the same fix for the "is this today's Jio" check.
 */
function heroDateLine(now: Date): string {
  const weekday = now.toLocaleDateString("en-SG", {
    weekday: "long",
    timeZone: "Asia/Singapore",
  });
  return `${weekday} · ${formatTime(now)}`;
}

/** A compact icon-avatar row inside the hero card — shared shape for the
 *  "Upcoming" and "Same as last time?" rows (UX review log #23). Not
 *  `EventRow`: that component is deliberately shared between the Jios list
 *  and Home's old full-width cards, and this redesign's row is a distinct,
 *  smaller shape that only exists inside this card. */
function HomeRow({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="hover:bg-cream flex items-center gap-3 rounded-xl p-2 transition-colors"
    >
      <span
        className="bg-ember-tint flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-sm font-medium">
          {title}
        </span>
        <span className="text-stone block truncate text-xs">{subtitle}</span>
      </span>
    </Link>
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
  //
  // `status !== "cancelled"`, not `=== "open"` — a closed Jio is decided,
  // not necessarily over. Voting can lock well before the lunch itself
  // happens, and a decided-but-future Jio is exactly as "upcoming" as one
  // still being voted on; excluding it here was a real bug, not a scope
  // choice (it also vanished entirely, rather than just losing its vote
  // controls). Only `cancelled` and still-polling Flexi Jios (no real date
  // yet) are excluded.
  const relevantEvents = events.filter(
    (e) => e.status !== "cancelled" && e.date_phase !== "polling"
  );
  const todaysJio = relevantEvents.find((e) => isSameSgtDay(e.scheduled_at, now));
  // Today's Jio is deliberately *not* excluded here despite already being
  // the headline above — eyes go to "Upcoming" out of habit regardless of
  // how bold the headline is, so it needs to actually be in the list, not
  // just above it. `EventRow` already self-labels a same-day row "Today,"
  // so this needs no new UI, and the still-in-the-future filter below still
  // drops it once it's actually passed, same as any other row.
  const upcomingList = relevantEvents
    .filter((e) => new Date(e.scheduled_at).getTime() > now.getTime())
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .slice(0, 2);

  // "Same as last time?" — one-tap repeat. Scoped to Jios *you* hosted: only
  // a host can meaningfully repeat "who / where / when."
  const lastHosted = events
    .filter((e) => e.host_id === user.id && e.status !== "open")
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))[0];

  // CHANGES_20260821_combined2.md §3C — a first-ever "Start a Jio" attempt
  // pre-checks co-attendees from the most recent Jio this account joined as
  // a guest, since that's the crowd a brand-new host most likely means to
  // invite. See firstHostInvite.ts for the actual selection logic.
  let firstHostInvite: InviteSelection | undefined;
  if (features.events) {
    const joinedEvent = pickFirstHostSourceEvent(events, user.id);
    if (joinedEvent) {
      try {
        const repo = await getRepoAsync();
        const source = await repo.getEvent(joinedEvent.id);
        firstHostInvite =
          (source && buildFirstHostInvite(source, user.id)) ?? undefined;
      } catch {
        // No prefill is a fine fallback — the ordinary empty picker still
        // works exactly as it does for everyone else.
      }
    }
  }

  const isNewerUser =
    !!profile?.created_at &&
    now.getTime() - new Date(profile.created_at).getTime() <
      NEW_USER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const decidedPlaceName =
    todaysJio?.winner_place_name ?? todaysJio?.winner_label ?? null;

  return (
    <div className="animate-fade-in space-y-6">
      {/*
        UX review log #23 — the whole hero (identity bar, action block,
        "same as last time," Upcoming) now lives inside one floating card,
        rather than as separate flat sections on the page background.
      */}
      <div className="bg-frost border-line space-y-4 rounded-3xl border p-4 shadow-[var(--shadow-md)]">
        <div className="flex items-center justify-between">
          {/* The lockup only appears on Home. Everywhere else the side rail
              or the page title carries the identity, and repeating it would
              be noise. */}
          <JioLockup className="md:hidden" size="sm" beta={config.isDemo} />
          <Link
            href="/profile"
            aria-label={`Your profile, ${name}`}
            className="bg-cream text-stone ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          >
            <YouIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>

        {/*
          The three-state action block. Headline keeps showing the real
          Jio's own title (or "What's for lunch?" with nothing on) rather
          than a generic templated phrase — confirmed against the shipped,
          tested version rather than the mockup's placeholder copy.
          1. No upcoming Jio today: "+ Start a Jio" leads, quick-pick beside it.
          2. Today's Jio still has an open vote: "Cast your vote" leads —
             starting a new one is a secondary action beside it, never
             blocked behind one already in progress.
          3. Today's Jio needs nothing further (closed): "+ Start a Jio"
             leads again, with a quiet "View" beside it and the decided
             place surfaced directly in the block.
        */}
        <div className="bg-ember rounded-2xl p-5 text-white">
          <p className="text-xs text-white/70">{heroDateLine(now)}</p>
          <h1 className="font-display !text-white mt-1 text-2xl leading-tight font-bold tracking-tight text-balance">
            {todaysJio ? todaysJio.title : "What’s for lunch?"}
          </h1>

          {features.events && todaysJio && todaysJio.status === "open" ? (
            <>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <LinkButton
                  href={`/events/${todaysJio.id}`}
                  variant="inverse"
                  className="flex-1"
                >
                  Cast your vote
                </LinkButton>
                <div className="flex-1">
                  <StartJioWizard
                    label="New Jio"
                    variant="outlineInverse"
                    initialInvite={firstHostInvite}
                  />
                </div>
              </div>
              {typeof todaysJio.going_count === "number" &&
                todaysJio.going_count > 0 && (
                  <p className="mt-3 text-xs text-white/80">
                    {todaysJio.going_count} going
                  </p>
                )}
            </>
          ) : todaysJio ? (
            <>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                {features.events && (
                  <div className="flex-1">
                    <StartJioWizard
                      variant="inverse"
                      initialInvite={firstHostInvite}
                    />
                  </div>
                )}
                <LinkButton
                  href={`/events/${todaysJio.id}`}
                  variant="outlineInverse"
                  className="flex-1"
                >
                  View
                </LinkButton>
              </div>
              {decidedPlaceName && (
                <p className="mt-3 text-xs text-white/80">
                  {decidedPlaceName} · {formatTime(todaysJio.scheduled_at)}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                {features.events && (
                  <div className="flex-1">
                    <StartJioWizard
                      variant="inverse"
                      initialInvite={firstHostInvite}
                    />
                  </div>
                )}
                {/* UX review log #6 — /suggest itself is retired; Places
                    carries the same personal picks now ("Quick & nearby,"
                    "New to try"), so that's where this now leads. */}
                <LinkButton
                  href="/places"
                  variant="outlineInverse"
                  className="flex-1"
                >
                  Just tell me where to go
                </LinkButton>
              </div>
              <p className="mt-3 text-xs text-white/80">
                Pick somewhere, or let the votes decide.
              </p>
            </>
          )}
        </div>

        {/*
          UX review log #23 — a calm-zone row, not the ember action hero, is
          where the real JioMark actually contrasts (true colours on cream,
          not faded onto ember), so this is where it belongs.
        */}
        {features.events && lastHosted && (
          <HomeRow
            href={`/events/new?repeatFrom=${lastHosted.id}`}
            icon={<JioMark className="h-6 w-6" />}
            title="Same as last time?"
            subtitle={`Start a Jio like "${lastHosted.title}"`}
          />
        )}

        {features.events && upcomingList.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2">
              <span className="text-stone text-xs font-semibold tracking-wide uppercase">
                Upcoming
              </span>
              <Link href="/events" className="text-ember text-xs underline">
                See all
              </Link>
            </div>
            {upcomingList.map((event) => {
              const winner = event.winner_place_name ?? event.winner_label;
              const subtitle =
                event.status === "closed" && winner
                  ? `${relativeDayLabel(event.scheduled_at, now)} · ${winner}`
                  : `${relativeDayLabel(event.scheduled_at, now)} · ${formatTime(event.scheduled_at)}`;
              return (
                <HomeRow
                  key={event.id}
                  href={`/events/${event.id}`}
                  icon={
                    <JiosIcon
                      className="text-ember h-5 w-5"
                      strokeWidth={1.75}
                    />
                  }
                  title={event.title}
                  subtitle={subtitle}
                />
              );
            })}
          </div>
        )}
      </div>

      <HintCard page="home" icon="🍜">
        Start a Jio to vote with the group, or tap &ldquo;Just tell me where
        to go&rdquo; for an instant pick with no voting.
      </HintCard>

      {features.metrics && <StreakBanner />}

      {isNewerUser && <AddToHomeScreenCard standalone />}

      {features.events && <NeedsAvailability />}

      {features.lobangs && <UnseenLobangCard />}
    </div>
  );
}
