import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";

/** Admin-only per-type mute for the push sent to every admin when a general
 *  report is filed — stacks on top of `/api/push/preference`'s master
 *  on/off, same shape reminders' own toggle uses. Writing this from a
 *  non-admin is harmless (it only ever affects `list_admin_report_
 *  recipients()`'s output, which already only ever includes real admins),
 *  so no admin check here — same low-stakes reasoning `/api/reports`
 *  itself already uses. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<{ enabled?: boolean }>(request);

    if (typeof body?.enabled !== "boolean") {
      return badRequest("Expected { enabled: boolean }");
    }

    await repo.setNotifyAdminReports(user.id, body.enabled);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
