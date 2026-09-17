import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";
import { featureGate } from "@/lib/config";

type Params = { params: Promise<{ id: string; entryId: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("kakis");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id, entryId } = await params;
    const repo = await getRepoAsync();
    await repo.removeKakiWishlistEntry(id, user.id, entryId);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
