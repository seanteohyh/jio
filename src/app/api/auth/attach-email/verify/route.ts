import { NextRequest } from "next/server";
import { getAuth, requireUser } from "@/lib/auth";
import { badRequest, errorResponse, json, readJson } from "@/lib/api";

/** Verify the 6-digit code from an attach-email confirmation message. */
export async function POST(request: NextRequest) {
  try {
    await requireUser();

    const body = await readJson<{ email?: string; token?: string }>(request);
    const email = body?.email?.trim().toLowerCase();
    const token = body?.token?.trim().replace(/\s+/g, "");

    if (!email) return badRequest("Email is required");
    if (!token || !/^\d{6}$/.test(token)) {
      return badRequest("Enter the 6-digit code from your email");
    }

    const auth = await getAuth();
    const result = await auth.verifyAttachEmailOtp(email, token);

    if (!result.ok) {
      return badRequest(result.error ?? "That code did not work");
    }

    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
