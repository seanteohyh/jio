import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";

type Params = { params: Promise<{ id: string }> };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Host locks in one candidate date, moving the Flexi Jio from 'polling' to
 * 'confirmed'. Any candidate date is allowed, not just the most-available
 * one — the UI pre-highlights the leader but never forces it.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const blocked = featureGate("events");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<{ date?: string }>(request);
    if (!body?.date || !DATE_RE.test(body.date)) {
      return badRequest("Which date?");
    }

    const event = await repo.confirmEventDate(id, user.id, body.date);
    return json({ ok: true, event });
  } catch (error) {
    return errorResponse(error);
  }
}
