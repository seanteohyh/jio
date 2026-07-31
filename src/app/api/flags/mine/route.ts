import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";

/** "My Reports" — the signed-in user's own flags, newest first. */
export async function GET() {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const flags = await repo.listMyFlags(user.id);
    return json({ flags });
  } catch (error) {
    return errorResponse(error);
  }
}
