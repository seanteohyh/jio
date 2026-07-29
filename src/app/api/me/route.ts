import { getCurrentUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { config, features } from "@/lib/config";
import { json } from "@/lib/api";

/**
 * Who am I, and what is this build capable of?
 *
 * Client components read this once on mount rather than each guessing at the
 * feature flags from their own env access.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return json({
      user: null,
      demo: config.isDemo,
      features,
      authMode: config.authAdapter,
      openSignup: config.openSignup,
    });
  }

  let displayName = user.display_name ?? null;

  try {
    const repo = await getRepoAsync();
    const profile = await repo.getProfile(user.id);
    if (profile) displayName = profile.display_name;
  } catch {
    // A missing profile is not an error; the fallback label is fine.
  }

  return json({
    user: {
      id: user.id,
      email: user.email,
      display_name:
        displayName ?? user.email?.split("@")[0] ?? `Teammate ${user.id.slice(0, 6)}`,
    },
    demo: config.isDemo,
    features,
    authMode: config.authAdapter,
    openSignup: config.openSignup,
  });
}
