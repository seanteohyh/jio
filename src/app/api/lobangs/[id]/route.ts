import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { errorResponse, json } from "@/lib/api";
import { featureGate } from "@/lib/config";

type Params = { params: Promise<{ id: string }> };

/** Mark a received lobang as seen. Only the recipient can do this. */
export async function PUT(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("lobangs");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    await repo.markLobangSeen(user.id, id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Either side can dismiss their copy — recipient clearing their inbox, or the sender retracting it. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const blocked = featureGate("lobangs");
  if (blocked) return blocked as NextResponse;

  try {
    const user = await requireUser();
    const { id } = await params;
    const repo = await getRepoAsync();

    await repo.dismissLobang(user.id, id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
