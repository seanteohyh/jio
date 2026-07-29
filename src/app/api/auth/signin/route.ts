import { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";
import { config } from "@/lib/config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Send a sign-in email.
 *
 * The same email carries both a magic link and a 6-digit code; which one the
 * user uses is up to them. Codes matter on mobile, where a link often opens in
 * the mail app's browser rather than the one holding the session.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJson<{ email?: string; next?: string }>(request);
    const email = body?.email?.trim().toLowerCase();

    if (!email || !EMAIL_RE.test(email)) {
      return badRequest("That does not look like an email address");
    }

    const origin = request.nextUrl.origin;
    const next = body?.next && body.next.startsWith("/") ? body.next : "/";
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const auth = await getAuth();
    const result = await auth.signInWithEmail(email, redirectTo, {
      // When open signup is off, an unknown address gets no email at all.
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
