import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { LinkButton } from "@/components/ui";

/**
 * Event invite landing page.
 *
 * Resolves the token to an event id and forwards. The event page itself
 * handles everything else — there is no separate "accept" step, because
 * following the link is the acceptance.
 */
export default async function EventInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/e/${token}`)}`);
  }

  const repo = await getRepoAsync();
  const event = await repo.getEvent(token);

  if (event) {
    // The comment above says following the link is the acceptance — this is
    // what actually makes that true. Without it, a visitor who never RSVPs
    // or votes has no footprint anywhere listEvents() is used, so their own
    // Jios tab can't find something they were genuinely invited to (§4).
    await repo.joinEventViaInvite(event.id, user.id);
  }

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

  redirect(`/events/${event.id}`);
}
