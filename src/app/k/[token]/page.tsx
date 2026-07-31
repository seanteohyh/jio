import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { LinkButton } from "@/components/ui";
import JoinKakiButton from "./JoinKakiButton";

/**
 * Kaki invite landing page.
 *
 * Resolves the token server-side so an invalid link says so immediately
 * instead of flashing an empty group. Signed-out visitors are bounced to
 * /login with a `next` back to here, so the invite survives the round trip.
 */
export default async function KakiInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/k/${token}`)}`);
  }

  const repo = await getRepoAsync();
  const kaki = await repo.getKaki(token);

  if (!kaki) {
    return (
      <div className="space-y-4 py-10 text-center">
        <h1 className="text-xl font-semibold">This invite is not valid</h1>
        <p className="text-stone text-sm">
          The link may have been mistyped, or the group may have been deleted.
        </p>
        <LinkButton href="/kakis">Your groups</LinkButton>
      </div>
    );
  }

  const alreadyMember = kaki.members.some((m) => m.user_id === user.id);

  if (alreadyMember) {
    redirect(`/kakis/${kaki.id}`);
  }

  return (
    <div className="mx-auto max-w-sm space-y-5 py-10 text-center">
      <div>
        <p className="text-stone text-sm">You have been invited to</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {kaki.name}
        </h1>
        <p className="text-stone mt-2 text-sm">
          {kaki.members.length} member
          {kaki.members.length === 1 ? "" : "s"} already in
        </p>
      </div>

      <JoinKakiButton token={token} />

      <p className="text-stone text-xs">
        Joining lets you vote on the group&apos;s Jios and shows your shared
        visits in the group stats.
      </p>
    </div>
  );
}
