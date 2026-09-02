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
  let isAdmin = false;
  let notifyAdminReports = true;

  try {
    const repo = await getRepoAsync();
    const [profile, admin] = await Promise.all([
      repo.getProfile(user.id),
      repo.isAdmin(user.id),
    ]);
    if (profile) displayName = profile.display_name;
    isAdmin = admin;
    notifyAdminReports = profile?.notify_admin_reports ?? true;
  } catch {
    // A missing profile (or a transient admin-check failure) is not fatal;
    // the fallback label and non-admin default are fine either way.
  }

  return json({
    user: {
      id: user.id,
      email: user.email,
      display_name:
        displayName ?? user.email?.split("@")[0] ?? `Teammate ${user.id.slice(0, 6)}`,
      is_admin: isAdmin,
      // Only meaningful for an admin, but harmless to include either way —
      // AdminReportNotificationsToggle reads it straight off this response
      // rather than needing its own fetch.
      notify_admin_reports: notifyAdminReports,
    },
    demo: config.isDemo,
    features,
    authMode: config.authAdapter,
    openSignup: config.openSignup,
  });
}
