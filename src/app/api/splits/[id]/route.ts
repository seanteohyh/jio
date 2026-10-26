import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, notFound, readJson } from "@/lib/api";
import { featureGate } from "@/lib/config";
import { parseSplitInput, type SplitBody } from "@/lib/splits";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("splits");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const split = await repo.getSplit(id, user.id);
    if (!split) return notFound("That bill split does not exist");
    return json({ split });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Re-saves an existing split with a fresh item/participant list — same
 * shape as `POST /api/splits`. Deliberately does not re-send the "you've
 * been added" push (see that route's own comment); a correction to an
 * already-notified split doesn't need to re-notify everyone. Can never
 * re-link or unlink the split from a Jio — see `writeSplit`'s own doc
 * comment — only the initial `POST` decides that.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const blocked = featureGate("splits");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    const body = await readJson<SplitBody>(request);
    const input = parseSplitInput(body);
    if (typeof input === "string") return badRequest(input);

    const split = await repo.updateSplit(id, user.id, input);
    return json({ split });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("splits");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    await repo.deleteSplit(id, user.id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
