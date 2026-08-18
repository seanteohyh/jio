import { getCurrentUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { Card, LinkButton } from "@/components/ui";
import PersonalInviteActions from "@/components/PersonalInviteActions";
import ShareLink from "@/components/ShareLink";
import { personalInviteUrl } from "@/lib/shareUrl";
import { config } from "@/lib/config";

/**
 * Personal invite link — CHANGES_20260818.md §3 / docs/user-discovery.md
 * §4.3. Same "unguessable token resolved server-side" shape as `/p/[id]`
 * and `/l/[token]`, but for a *person* rather than a place or a lobang:
 * opening it shows that person's profile card with two actions, "Start a
 * Jio with them" and "Add them to a Kaki." Deliberately not "add as
 * friend" — viewing this page creates no edge on its own, only actually
 * using one of the two actions does.
 *
 * Unlike `/p/[id]`, a signed-in visitor is never bounced away — the
 * actions here are the whole point of the page, not a cut-down preview of
 * something fuller elsewhere.
 */
export default async function PersonalInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const viewer = await getCurrentUser();
  const repo = await getRepoAsync();

  let invite;
  try {
    invite = await repo.resolvePersonalInvite(token);
  } catch (error) {
    // Same reasoning as /p/[id] and /l/[token]: a stranger following a
    // link can't act on a raw error, so a failed lookup reads the same as
    // a genuinely unknown link rather than crashing the page.
    console.error("resolvePersonalInvite failed", error);
    invite = null;
  }

  if (!invite) {
    return (
      <div className="space-y-4 py-10 text-center">
        <h1 className="text-xl font-semibold">This link isn&apos;t available</h1>
        <p className="text-stone text-sm">
          The link may be wrong, or it may have been replaced by a newer one.
        </p>
      </div>
    );
  }

  const isSelf = viewer?.id === invite.user_id;

  return (
    <div className="space-y-5">
      <header className="text-center">
        <p className="text-stone text-sm">Personal invite link</p>
        <h1 className="font-display text-ink mt-1 text-3xl font-bold tracking-tight">
          {invite.display_name}
        </h1>
      </header>

      {isSelf ? (
        <Card className="space-y-2 text-center">
          <p className="text-sm">This is your own invite link.</p>
          <LinkButton href="/profile">Back to your profile</LinkButton>
        </Card>
      ) : viewer ? (
        <PersonalInviteActions
          userId={invite.user_id}
          displayName={invite.display_name}
        />
      ) : (
        <Card className="space-y-3 text-center">
          <p className="text-sm">
            <span className="font-medium">{config.appName}</span> is how our
            team decides where to eat — sign in to start a Jio with{" "}
            {invite.display_name} or add them to a Kaki.
          </p>
          <LinkButton
            href={`/login?next=${encodeURIComponent(`/u/${token}`)}`}
          >
            Join to see more
          </LinkButton>
        </Card>
      )}

      {!isSelf && (
        <ShareLink
          url={personalInviteUrl(token)}
          label="Share this invite link"
          shareText={`Start a Jio with ${invite.display_name} on ${config.appName}`}
        />
      )}
    </div>
  );
}
