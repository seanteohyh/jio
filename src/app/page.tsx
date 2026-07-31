import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRepoAsync } from "@/lib/data/repo";
import { config, features } from "@/lib/config";
import StartJioWizard from "@/components/home/StartJioWizard";
import HomeJios from "@/components/home/HomeJios";
import NeedsAvailability from "@/components/home/NeedsAvailability";
import StreakBanner from "@/components/home/StreakBanner";
import { LinkButton } from "@/components/ui";
import JioLockup from "@/components/brand/JioLockup";

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
      {/* The lockup only appears on Home. Everywhere else the side rail or the
          page title carries the identity, and repeating it would be noise. */}
      <JioLockup className="md:hidden" size="sm" beta={config.isDemo} />

      <header>
        <p className="text-stone text-sm">
          {greeting()}, {name}.
        </p>
        <h1 className="font-display text-ink mt-1 text-4xl leading-[1.05] font-bold tracking-tight">
          What&rsquo;s for lunch?
        </h1>
        <p className="text-stone mt-2 text-sm">
          Pick somewhere, or let the votes decide.
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
    </div>
  );
}
