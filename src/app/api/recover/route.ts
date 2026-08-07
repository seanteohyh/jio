import { NextRequest } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/serverAuth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { config } from "@/lib/config";

interface Body {
  token?: string;
}

/**
 * Redeems a recovery link — CHANGES_20260807.md §4's collision-safe
 * counterpart to name-based claim.
 *
 * Deliberately not built on `nameAuth` or gated behind
 * `NEXT_PUBLIC_JIO_AUTH_ADAPTER`: talks to `createAuthServerClient()`
 * directly, the same way `nameAuth.ts` does, so this keeps working
 * unchanged if name-based claim is ever turned off once real name
 * collisions become possible — the two are independent front doors onto
 * the same `mergeUserAccounts`, not layers of one system.
 *
 * No `requireUser()` — the entire point is recovering a session that may
 * not exist right now. `signInAnonymously()` stands one up first if needed,
 * mirroring `nameAuth.signInWithName`'s "ensure a session, then merge onto
 * it" shape, since there is no way to instead swap which `auth.uid()` this
 * browser holds.
 */
export async function POST(request: NextRequest) {
  try {
    if (config.isDemo) {
      return badRequest("Recovery links aren't meaningful in demo mode");
    }

    const body = await readJson<Body>(request);
    const token = body?.token?.trim();
    if (!token) return badRequest("Missing recovery link");

    const repo = await getRepoAsync();
    const oldUserId = await repo.resolveRecoveryToken(token);
    if (!oldUserId) {
      return badRequest("That recovery link isn't valid anymore");
    }

    const client = await createAuthServerClient();
    const { data: existing } = await client.auth.getUser();
    let userId = existing.user?.id ?? null;

    if (!userId) {
      const { data, error } = await client.auth.signInAnonymously();
      if (error) {
        if (/anonymous/i.test(error.message)) {
          return badRequest(
            "Anonymous sign-ins are switched off in Supabase. Enable them " +
              "under Authentication → Providers → Anonymous sign-ins."
          );
        }
        return badRequest(error.message);
      }
      if (!data.user) return badRequest("Could not start a session");
      userId = data.user.id;
    }

    if (userId !== oldUserId) {
      await repo.mergeUserAccounts(userId, userId, oldUserId);
    }

    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
