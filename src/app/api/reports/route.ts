import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { sendPushToUsers } from "@/lib/push";
import type { Repo } from "@/lib/data";
import type { GeneralReport, GeneralReportCategory } from "@/types";

const VALID_CATEGORIES: GeneralReportCategory[] = [
  "not_working",
  "place_wrong",
  "suggestion",
  "other",
];

/** Notification bodies stay short — a long "What should we build or fix?"
 *  answer would otherwise blow past what most OSes actually render. */
const COMMENT_EXCERPT_LENGTH = 120;

function excerpt(comment: string | null | undefined): string | null {
  if (!comment) return null;
  return comment.length > COMMENT_EXCERPT_LENGTH
    ? `${comment.slice(0, COMMENT_EXCERPT_LENGTH)}…`
    : comment;
}

/** Every admin who hasn't muted this gets a push — a report and a
 *  suggestion both land in the same `general_reports` queue, so both fire
 *  from here rather than each needing their own trigger. The reporter is
 *  excluded even if they happen to be an admin themselves, same as no
 *  other push in this app ever notifies the person who triggered it. */
async function notifyAdminsOfReport(
  repo: Repo,
  report: GeneralReport
): Promise<void> {
  try {
    const adminIds = (await repo.listAdminReportRecipients()).filter(
      (id) => id !== report.reported_by
    );
    if (adminIds.length === 0) return;

    const reporter = report.reported_by_name ?? "Someone";
    const isSuggestion = report.category === "suggestion";
    const comment = excerpt(report.comment);

    await sendPushToUsers(repo, adminIds, {
      title: isSuggestion ? "New suggestion for Jio" : "New problem reported",
      body: comment ? `${reporter}: "${comment}"` : `From ${reporter}`,
      url: "/admin/moderation",
    });
  } catch {
    // Logged inside sendPushToUsers already; a report must never fail on this.
  }
}

/**
 * UX review log #17 — "Report a problem," Profile's entry point for a
 * problem that isn't about any one place. Any signed-in user, same
 * low-stakes shape as `/api/places/[id]/flag` — this isn't a moderation
 * action, so no admin/creator check. Home's "Give feedback" suggestion
 * card posts here too, under its own `suggestion` category.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const body = await readJson<{ category?: string; comment?: string }>(
      request
    );
    const category = body?.category as GeneralReportCategory | undefined;
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return badRequest("Pick what this is about");
    }

    const report = await repo.createGeneralReport(
      user.id,
      category,
      body?.comment?.trim() || null
    );
    await notifyAdminsOfReport(repo, report);
    return json({ report }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
