import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";

/** The one on/off toggle covering every Jio-lifecycle push (§6). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<{ enabled?: boolean }>(request);

    if (typeof body?.enabled !== "boolean") {
      return badRequest("Expected { enabled: boolean }");
    }

    await repo.setNotifyEvents(user.id, body.enabled);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
