import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

/**
 * Where the magic link lands.
 *
 * Exchanges the one-time code in the URL for a session cookie, then bounces to
 * wherever the user was heading. On failure it sends them back to /login with
 * a readable message rather than dumping them on a blank page.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const errorDescription = searchParams.get("error_description");

  if (errorDescription) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescription)}`
    );
  }

  if (config.isDemo) {
    // Demo mode has no session to establish.
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("That sign-in link is missing its code. Try again.")}`
    );
  }

  try {
    const { createAuthServerClient } = await import(
      "@/lib/supabase/serverAuth"
    );
    const client = await createAuthServerClient();

    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      );
    }

    // Make sure a profile row exists. The database trigger in migration 011
    // normally handles this, but a project restored from a backup taken before
    // that migration would not have it.
    const { data } = await client.auth.getUser();
    if (data.user) {
      const fallbackName =
        data.user.email?.split("@")[0] ?? `Teammate ${data.user.id.slice(0, 6)}`;
      await client
        .from("profiles")
        .upsert(
          { user_id: data.user.id, display_name: fallbackName },
          { onConflict: "user_id", ignoreDuplicates: true }
        );
    }

    return NextResponse.redirect(`${origin}${next}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not complete sign-in";
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}`
    );
  }
}
