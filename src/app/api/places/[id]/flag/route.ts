import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import type { FlagReason } from "@/types";

type Params = { params: Promise<{ id: string }> };

const VALID_REASONS: FlagReason[] = [
  "closed",
  "wrong_info",
  "duplicate",
  "inappropriate",
  "other",
];

/**
 * Report an inaccurate place. Any signed-in user — this is a low-stakes
 * report, not a moderation action, so unlike `/block` it needs no admin/
 * creator check. The place stays fully active; a "Reported" badge is the
 * only visible effect until an admin resolves it via `/api/admin/flags`.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ reason?: string; comment?: string }>(request);
    const reason = body?.reason as FlagReason | undefined;
    if (!reason || !VALID_REASONS.includes(reason)) {
      return badRequest("Pick a reason for the report");
    }

    const flag = await repo.flagPlace(
      user.id,
      id,
      reason,
      body?.comment?.trim() || null
    );
    return json({ flag }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
