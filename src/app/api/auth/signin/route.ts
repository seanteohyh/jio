import { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { config } from "@/lib/config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    }>(request);

    if (!body) return badRequest("Expected a JSON body");

    const auth = await getAuth();

    // ---- Name-only ----
    if (body.display_name !== undefined) {
      const name = body.display_name.trim();
      if (!name) return badRequest("Put in a name so people know who you are");
      if (name.length > 40) return badRequest("That name is a bit long");

      const result = await auth.signInWithName(name);
      if (!result.ok) return badRequest(result.error ?? "Could not sign in");

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
