import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import type { GeneralReportCategory } from "@/types";

const VALID_CATEGORIES: GeneralReportCategory[] = [
  "not_working",
  "place_wrong",
  "other",
];

/**
 * UX review log #17 — "Report a problem," Profile's entry point for a
 * problem that isn't about any one place. Any signed-in user, same
 * low-stakes shape as `/api/places/[id]/flag` — this isn't a moderation
 * action, so no admin/creator check.
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
    return json({ report }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
