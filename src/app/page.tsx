import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { config, features } from "@/lib/config";
import StartJioWizard from "@/components/home/StartJioWizard";
import HomeJios from "@/components/home/HomeJios";
import NeedsAvailability from "@/components/home/NeedsAvailability";
import StreakBanner from "@/components/home/StreakBanner";
import { LinkButton } from "@/components/ui";

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 11) return "Morning";
  if (hour < 15) return "Lunchtime";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Resolve the display name server-side so the greeting does not flash.
  let name = user.display_name ?? user.email?.split("@")[0] ?? "there";
  let profile = null;
  try {
    const repo = await getRepoAsync();
    profile = await repo.getProfile(user.id);
  } catch {
    // Fall back to whatever we already have.
  }

  // redirect() throws internally, so it must never sit inside the try/catch
  // above — a catch there would swallow the redirect itself.
  if (profile) {
    name = profile.display_name;
    if (!profile.onboarded_at) redirect("/welcome");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {name}.
        </h1>
        <p className="text-dolch-muted mt-1 text-sm">
          Where are we eating today?
        </p>
      </header>

      {features.metrics && <StreakBanner />}

      <div className="flex flex-col gap-2 sm:flex-row">
        {features.events ? (
          <div className="flex-1">
            <StartJioWizard />
          </div>
        ) : null}
        <LinkButton href="/suggest" variant="secondary" className="flex-1">
          Just tell me where to go
        </LinkButton>
      </div>

      {features.events && <HomeJios />}

      {features.events && <NeedsAvailability />}

      {config.isDemo && (
        <p className="text-dolch-muted border-dolch-border rounded-xl border border-dashed px-4 py-3 text-xs">
          You are in demo mode: 22 sample places, two invented teammates and one
          Jio mid-vote. Everything is in memory and resets when the dev server
          restarts. Add Supabase credentials to <code>.env.local</code> to make
          it real.
        </p>
      )}
    </div>
  );
}
