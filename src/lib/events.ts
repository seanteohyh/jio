import type { Repo } from "@/lib/data";

/**
 * Turn a picker's selection (people plus groups) into a flat invitee list.
 *
 * A chosen group is **snapshotted** — its members become individual invitees
 * right now, rather than being resolved from live membership later. Migration
 * 019 settled this for lobangs and the same reasoning applies: if membership
 * were read at read-time, someone joining the group next week would silently
 * become a person who "was invited" to last week's lunch, and someone leaving
 * would vanish from it.
 *
 * Deliberately server-side: the client has no business deciding who counts as
 * a member, and `getKaki` is already subject to the same RLS as everything
 * else. Overlaps are deduped silently — picking a group and then someone
 * already in it is a normal thing to do, not an error. The host is dropped
 * because they are the host.
 *
 * Shared by `POST /api/events` (creation) and `POST /api/events/[id]/invitees`
 * (CHANGES_20260819b.md — inviting more people after the fact) — same
 * expansion either way, not two copies that could drift.
 */
export async function expandInvitees(
  repo: Repo,
  hostId: string,
  explicit: string[],
  kakiIds: string[]
): Promise<string[]> {
  const ids = new Set(explicit);

  for (const kakiId of kakiIds) {
    const kaki = await repo.getKaki(kakiId);
    if (!kaki) continue;
    for (const member of kaki.members) ids.add(member.user_id);
  }

  ids.delete(hostId);
  return [...ids];
}
