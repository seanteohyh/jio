import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, forbidden, json, readJson } from "@/lib/api";

interface MergeBody {
  keep_user_id?: string;
  merge_user_ids?: string[];
}

/**
 * §5 — admin-triggered account merge. Supports merging more than one stale
 * account into the same keeper in one request, for someone who hit the
 * identity-loss bug repeatedly before a fix landed.
 *
 * Each merge runs through the same `merge_user_accounts` (migration 040)
 * `mergeUserAccounts` already uses for §4's self-service claim — one
 * reassignment operation, two front doors. Sequential, not parallel: each
 * one deletes an `auth.users` row, and there's no reason to race those.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();

    const admin = await repo.isAdmin(user.id);
    if (!admin) return forbidden("Admins only");

    const body = await readJson<MergeBody>(request);
    const keepUserId = body?.keep_user_id;
    const mergeUserIds = body?.merge_user_ids;

    if (!keepUserId) return badRequest("Which account should stay?");
    if (!Array.isArray(mergeUserIds) || mergeUserIds.length === 0) {
      return badRequest("Pick at least one account to merge in");
    }
    if (mergeUserIds.includes(keepUserId)) {
      return badRequest("Cannot merge the kept account into itself");
    }

    // A `deleteWarning` means the data move genuinely succeeded but the
    // old account's own retirement (the one step needing the service
    // role) didn't — real, worth the admin's attention, but not a reason
    // to report the whole request as failed when every other account in
    // this same batch merged cleanly.
    const warnings: string[] = [];
    for (const mergeUserId of mergeUserIds) {
      const { deleteWarning } = await repo.mergeUserAccounts(
        user.id,
        keepUserId,
        mergeUserId
      );
      if (deleteWarning) warnings.push(deleteWarning);
    }

    return json({
      ok: true,
      merged: mergeUserIds.length,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
