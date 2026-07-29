import { DEMO_USER } from "@/lib/constants";
import type { AuthAdapter } from "./index";

/**
 * No-auth adapter for demo mode.
 *
 * Always returns the same fixed user, so every page renders as if signed in
 * and nobody has to configure an email provider to look at the app.
 */
export const demoAuth: AuthAdapter = {
  name: "demo",

  async getCurrentUser() {
    return {
      id: DEMO_USER.id,
      email: DEMO_USER.email,
      display_name: DEMO_USER.display_name,
    };
  },

  async signInWithEmail() {
    return { ok: true };
  },

  async verifyOtp() {
    return { ok: true };
  },

  async signOut() {
    // Nothing to sign out of.
  },
};

export default demoAuth;
