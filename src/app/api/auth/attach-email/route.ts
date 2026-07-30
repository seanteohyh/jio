import { NextRequest } from "next/server";
import { getAuth, requireUser } from "@/lib/auth";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Attach a permanent email to the *current* session — the durable-identity
 * upgrade for a name-mode anonymous user (see lib/auth/index.ts). Requires
 * SMTP to be configured, same as ordinary email sign-in.
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser();

    const body = await readJson<{ email?: string }>(request);
    const email = body?.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return badRequest("That does not look like an email address");
    }

    const auth = await getAuth();
    if (!auth.capabilities.attachEmail) {
      return badRequest(
        "This deployment does not support attaching an email"
      );
    }

    const origin = request.nextUrl.origin;
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/profile")}`;

    const result = await auth.attachEmail(email, redirectTo);
    if (!result.ok) {
      return badRequest(result.error ?? "Could not send the confirmation email");
    }

    return json({ ok: true, email });
  } catch (error) {
    return errorResponse(error);
  }
}
