import { DEMO_USER } from "@/lib/constants";
import type { AuthAdapter } from "./index";

/**
 * No-auth adapter for demo mode.
 *
 * Always the same fixed user, so every page renders as if signed in and nobody
 * has to configure anything to look at the app.
 */
export const demoAuth: AuthAdapter = {
  name: "demo",
  capabilities: { name: true, email: false, attachEmail: false },

  async getCurrentUser() {
    return {
      id: DEMO_USER.id,
      email: DEMO_USER.email,
      display_name: DEMO_USER.display_name,
    };
  },

  async signInWithName() {
    return { ok: true };
  },

  async signInWithEmail() {
    return { ok: true };
  },

  async verifyOtp() {
    return { ok: true };
  },

  async attachEmail() {
    return { ok: true };
  },

  async verifyAttachEmailOtp() {
    return { ok: true };
  },

  async signOut() {
    // Nothing to sign out of.
  },
};

export default demoAuth;
