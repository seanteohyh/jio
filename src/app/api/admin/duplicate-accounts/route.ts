import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, forbidden, json } from "@/lib/api";

/**
 * §5's "possible duplicate accounts" list — same accounts §1a's SQL query
 * was written to find by hand, surfaced automatically instead. Admin only,
 * same convention as every other admin route: the real gate is
 * `merge_user_accounts` itself refusing a non-admin who isn't merging into
 * their own account, this check just avoids flashing the list at someone
 * who can't act on it.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    const groups = await repo.listDuplicateProfiles();
    return json({ groups });
  } catch (error) {
    return errorResponse(error);
  }
}
