import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { sendPushToUsers } from "@/lib/push";

type Params = { params: Promise<{ id: string }> };

/**
 * Adds an existing user to a Kaki directly — CHANGES_20260812.md §1. Any
 * current member may add anyone; `repo.addKakiMember` is the real gate
 * (add_kaki_member, migration 045), this route's own auth check exists so
 * demoRepo enforces it too, same reasoning as everywhere else in this app
 * that layers an application-level check on top of RLS.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("kakis");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ user_id?: string }>(request);
    if (!body?.user_id) return badRequest("Which person?");

    await repo.addKakiMember(id, body.user_id, user.id);

    const kaki = await repo.getKaki(id);
    try {
      await sendPushToUsers(repo, [body.user_id], {
        title: "Added to a Kaki",
        body: `You're now in ${kaki?.name ?? "a lunch group"}`,
        url: `/kakis/${id}`,
      });
    } catch {
      // Best-effort — a push failure must never fail the add itself.
    }

    return json({ ok: true, kaki });
  } catch (error) {
    return errorResponse(error);
  }
}
