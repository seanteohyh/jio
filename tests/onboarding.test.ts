import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEMO_USER_ID } from "@/lib/constants";

/**
 * The one-time /welcome screen is gated on `profiles.onboarded_at` being
 * null. `completeOnboarding` is the only path that sets it — a later rename
 * via `upsertProfile` (the /profile page's own flow) must never touch it,
 * or a returning user would get bounced back to /welcome by mistake.
 */

beforeEach(() => {
  resetDemoStore();
});

describe("onboarding", () => {
  it("seed users are already onboarded, so demo mode never shows /welcome", async () => {
    const profile = await demoRepo.getProfile(DEMO_USER_ID);
    expect(profile?.onboarded_at).toBeTruthy();
  });

  it("a brand new profile starts with onboarded_at unset", async () => {
    const profile = await demoRepo.upsertProfile("new-user-1", "Priya");
    expect(profile.onboarded_at).toBeFalsy();
  });

  it("completeOnboarding sets both the name and onboarded_at", async () => {
    const profile = await demoRepo.completeOnboarding("new-user-2", "Wei Jie");
    expect(profile.display_name).toBe("Wei Jie");
    expect(profile.onboarded_at).toBeTruthy();
  });

  it("a later rename via upsertProfile never clears onboarded_at", async () => {
    await demoRepo.completeOnboarding(DEMO_USER_ID, "Original Name");
    const renamed = await demoRepo.upsertProfile(DEMO_USER_ID, "New Name");

    expect(renamed.display_name).toBe("New Name");
    expect(renamed.onboarded_at).toBeTruthy();
  });
});
