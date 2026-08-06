import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";

interface SubscribeBody {
  endpoint?: string;
  p256dh?: string;
  authKey?: string;
}

/** Registers this browser for push — called once permission is granted and
 *  `PushManager.subscribe()` resolves. See AddToHomeScreenPrompt/§2 for why
 *  a browser tab can even ask on iOS: it can't, until installed. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const repo = await getRepoAsync();
    const body = await readJson<SubscribeBody>(request);

    if (!body?.endpoint || !body?.p256dh || !body?.authKey) {
      return badRequest("Expected endpoint, p256dh and authKey");
    }

    await repo.savePushSubscription(user.id, {
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      authKey: body.authKey,
    });

    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Unsubscribing — the endpoint is enough to identify the row; RLS/the repo
 *  scope deletion to the caller's own regardless of what's passed. */
export async function DELETE(request: NextRequest) {
  try {
    await requireUser();
    const repo = await getRepoAsync();
    const endpoint = request.nextUrl.searchParams.get("endpoint");

    if (!endpoint) return badRequest("Which subscription?");

    await repo.deletePushSubscription(endpoint);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
