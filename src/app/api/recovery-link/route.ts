import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json, readJson } from "@/lib/api";

interface Body {
  /** Omit to get a link for your own account. An admin may pass someone
   *  else's — `generateRecoveryToken` enforces that distinction. */
  user_id?: string;
}

/**
 * Mints (or replaces) a personal recovery link — CHANGES_20260807.md §4's
 * collision-safe counterpart to name-based claim. See migration 041 for
 * why the token itself, not the caller's identity, is what a redemption
 * checks.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const body = await readJson<Body>(request);
    const targetUserId = body?.user_id ?? user.id;

    const token = await repo.generateRecoveryToken(user.id, targetUserId);
    return json({ token, url: `/recover/${token}` });
  } catch (error) {
    return errorResponse(error);
  }
}
