import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";

/** Powers the invitee picker when creating an event. Names only, no emails. */
export async function GET() {
  try {
    await requireUser();
    const repo = await getRepoAsync();
    const users = await repo.listAllUsers();
    return json({ users });
  } catch (error) {
    return errorResponse(error);
  }
}
