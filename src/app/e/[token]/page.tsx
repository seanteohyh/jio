import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { Card, Chip, LinkButton } from "@/components/ui";
import ShareLink from "@/components/ShareLink";
import { eventInviteUrl } from "@/lib/shareUrl";
import { config } from "@/lib/config";
import { formatDateTime } from "@/lib/utils";

/**
 * Event invite landing page.
 *
 * Signed in, resolving the token to an event id and forwarding is the whole
 * job — there is no separate "accept" step, because following the link is
 * the acceptance.
 *
 * Signed out (CHANGES_20260821_combined2.md §3A): rather than bouncing
 * straight to `/login` with nothing to show for it, a narrow, privacy-safe
 * preview renders here first — same "unguessable token, SECURITY DEFINER
 * resolver" shape as `/p/[id]`/`/l/[token]`. See `PublicEventPreview`'s own
 * doc comment for exactly what's excluded (votes, invitee identities, RSVP
 * names, per-option counts) and why.
 *
 * §2's first-timer fix uses *two* independent signals to decide whether to
 * route through `/welcome` instead of straight into the event — deliberately
 * not just one: `!profile.onboarded_at` catches an `email`-mode first-timer
 * (onboarding genuinely hasn't happened yet), but is always already true by
 * this point in `name` mode, since that mode's sign-in screen stamps
 * onboarding immediately. `hadNoPriorJios` (this account has never touched
 * *any* Jio before, checked before the join below adds this one) is what
 * actually catches a `name`-mode first-timer, and works in `email` mode too
 * — either signal being true is enough.
 */
export default async function EventInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getCurrentUser();

  if (!user) {
    const repo = await getRepoAsync();

    let preview;
    try {
      preview = await repo.getPublicEventPreview(token);
    } catch (error) {
      console.error("getPublicEventPreview failed", error);
      preview = null;
    }

    if (!preview) {
      return (
        <div className="space-y-4 py-10 text-center">
          <h1 className="text-xl font-semibold">This invite is not valid</h1>
          <p className="text-stone text-sm">
            The link may have been mistyped, or the Jio may have been
            cancelled.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            {preview.title}
          </h1>
          <p className="text-stone mt-1 text-sm">
            Hosted by {preview.hostName}
            {preview.datePhase !== "polling" &&
              ` · ${formatDateTime(preview.scheduledAt)}`}
          </p>
          {/* UX review log #25 — once decided, voting is no longer
              relevant: surface the actual result instead of "going so far"
              and the still-open vote options. */}
          {preview.status === "closed" && preview.winnerPlaceName ? (
            <p className="mt-2 text-sm">
              <span className="text-sage font-medium">Decided:</span>{" "}
              {preview.winnerPlaceName}
            </p>
          ) : (
            <>
              <p className="text-stone mt-1 text-sm">
                {preview.goingCount > 0
                  ? `${preview.goingCount} going so far`
                  : "Nobody's confirmed yet"}
              </p>

              {preview.placeOptions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {preview.placeOptions.map((option) => (
                    <Chip key={option.id}>{option.name}</Chip>
                  ))}
                </div>
              )}
            </>
          )}
        </header>

        {preview.notes && (
          <Card className="border-line bg-cream/60">
            <p className="text-stone text-xs font-medium">Notes from the host</p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{preview.notes}</p>
          </Card>
        )}

        <Card className="space-y-3 text-center">
          <p className="text-sm">
            <span className="font-medium">{config.appName}</span>{" "}
            {preview.status === "closed" && preview.winnerPlaceName
              ? "is how our team decides where to eat — sign in to see who's going and the full details."
              : "is how our team decides where to eat — sign in to vote, RSVP, and see the full details."}
          </p>
          <LinkButton
            href={`/login?next=${encodeURIComponent(`/e/${token}`)}`}
          >
            Sign in to join
          </LinkButton>
        </Card>

        <ShareLink
          url={eventInviteUrl(token)}
          label="Share this Jio"
          shareText={`Join "${preview.title}" on ${config.appName}`}
        />
      </div>
    );
  }

  const repo = await getRepoAsync();
  const event = await repo.getEvent(token);

  if (!event) {
    return (
      <div className="space-y-4 py-10 text-center">
        <h1 className="text-xl font-semibold">This invite is not valid</h1>
        <p className="text-stone text-sm">
          The link may have been mistyped, or the Jio may have been cancelled.
        </p>
        <LinkButton href="/events">Your Jios</LinkButton>
      </div>
    );
  }

  // Checked *before* the join below, since joining is what would otherwise
  // make this account's Jio list non-empty — this is the mode-agnostic
  // signal for "has this account ever touched a single Jio before," used
  // alongside (not instead of) the onboarded_at check further down. In
  // `name` mode, sign-in itself stamps onboarding immediately, so
  // onboarded_at alone is always already satisfied by the time this page
  // runs and never catches a name-mode first-timer — this is what actually
  // does, regardless of which auth mode is configured.
  let hadNoPriorJios = false;
  try {
    hadNoPriorJios = (await repo.listEvents(user.id)).length === 0;
  } catch {
    // Safer default: treat as not-a-first-timer rather than force everyone
    // through /welcome if this lookup fails for some reason.
  }

  // The comment above says following the link is the acceptance — this is
  // what actually makes that true. Without it, a visitor who never RSVPs
  // or votes has no footprint anywhere listEvents() is used, so their own
  // Jios tab can't find something they were genuinely invited to (§4).
  await repo.joinEventViaInvite(event.id, user.id);

  // CHANGES_20260821_combined2.md §2 — a first-timer invited straight into a
  // Jio via this link never had this checked anywhere: Home is the only
  // other place that gates on `onboarded_at`, and a visitor who follows an
  // event link never lands there first. Without this, their entire first
  // session was just this one event page — no Home, no /welcome, no
  // personal invite link of their own. The join above already
  // ran, so /welcome's own redirect to Home afterward is what actually
  // surfaces this Jio, rather than sending them back into it directly.
  let profile = null;
  try {
    profile = await repo.getProfile(user.id);
  } catch {
    // Fall through to the event page — the join already succeeded, so
    // that's still strictly better than an error here.
  }
  if ((profile && !profile.onboarded_at) || hadNoPriorJios) {
    redirect("/welcome");
  }

  redirect(`/events/${event.id}`);
}
