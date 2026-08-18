import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";
import { personalInviteUrl } from "@/lib/shareUrl";

/**
 * Mints (or replaces) a personal invite link — CHANGES_20260818.md §3 /
 * docs/user-discovery.md §4.3. Always for the caller's own account; unlike
 * `/api/recovery-link` there's no admin-issues-it-for-someone-else path,
 * since this one is meant to be handed out by its owner, not recovered on
 * their behalf.
 */
export async function POST() {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const token = await repo.generatePersonalInviteToken(user.id, user.id);
    return json({ token, url: personalInviteUrl(token) });
  } catch (error) {
    return errorResponse(error);
  }
}
