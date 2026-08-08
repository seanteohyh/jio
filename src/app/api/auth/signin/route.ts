import { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { config } from "@/lib/config";
import { sendPushToUsers } from "@/lib/push";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * §3 item 5 — a declined name-match is a *confirmed* duplicate, the one
 * moment worth telling an admin about rather than waiting for someone to
 * happen to check /admin/accounts. Best-effort: never lets a notification
 * failure surface as a sign-in error.
 */
async function notifyAdminsOfDuplicateName(name: string): Promise<void> {
  try {
    const repo = await getRepoAsync();
    const adminIds = await repo.listAdminIds();
    await sendPushToUsers(repo, adminIds, {
      title: "Possible duplicate account",
      body: `Two accounts are now both named "${name}" — confirmed as different people at sign-in.`,
      url: "/admin/accounts",
    });
  } catch {
    // Logged inside sendPushToUsers already; nothing more to do here.
  }
}

/**
 * Sign in.
 *
 * Two shapes, decided by which field the body carries:
 *
 *   { display_name }  → name-only. You are in immediately.
 *   { email }         → sends a magic link and a 6-digit code.
 *
 * Which one the deployment accepts is the adapter's business, not this
 * route's. An adapter that does not support a style returns a readable
 * refusal rather than this file growing a mode check.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJson<{
      display_name?: string;
      email?: string;
      next?: string;
      /** Omitted on the first attempt. `true`/`false` resolves a
       *  `needs_confirmation` response from a previous call — see
       *  signInWithName's doc comment. */
      confirm_claim?: boolean;
    }>(request);

    if (!body) return badRequest("Expected a JSON body");

    const auth = await getAuth();

    // ---- Name-only ----
    if (body.display_name !== undefined) {
      const name = body.display_name.trim();
      if (!name) return badRequest("Put in a name so people know who you are");
      if (name.length > 40) return badRequest("That name is a bit long");

      const result = await auth.signInWithName(name, body.confirm_claim);

      if (result.needsConfirmation) {
        // Not an error — the client shows a confirm prompt and calls this
        // same route again with confirm_claim set. Nothing has changed yet.
        return json({
          ok: false,
          needs_confirmation: true,
          matched_name: result.matchedName,
        });
      }

      if (!result.ok) return badRequest(result.error ?? "Could not sign in");

      if (result.duplicateConfirmed) {
        await notifyAdminsOfDuplicateName(name);
      }

      return json({ ok: true, display_name: name });
    }

    // ---- Email ----
    const email = body.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return badRequest("That does not look like an email address");
    }

    const origin = request.nextUrl.origin;
    const next = body.next && body.next.startsWith("/") ? body.next : "/";
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const result = await auth.signInWithEmail(email, redirectTo, {
      shouldCreateUser: config.openSignup,
    });

    if (!result.ok) {
      return badRequest(result.error ?? "Could not send the sign-in email");
    }

    return json({ ok: true, email });
  } catch (error) {
    return errorResponse(error);
  }
}
