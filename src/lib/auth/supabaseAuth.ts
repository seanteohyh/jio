import { createAuthServerClient, getValidatedUser } from "@/lib/supabase/serverAuth";
import { UNSUPPORTED, type AuthAdapter } from "./index";

/**
 * Supabase Auth adapter — passwordless email.
 *
 * Two flows off the same Supabase call:
 *  - magic link: the email contains a link back to /auth/callback
 *  - OTP: the same email also contains a 6-digit code, typed into the app
 *
 * The code path matters more than it looks. On a phone, a magic link often
 * opens in the mail app's in-app browser rather than the browser holding the
 * session, and sign-in silently does nothing. Typing six digits always works.
 */
export const supabaseAuth: AuthAdapter = {
  name: "email",
  capabilities: { name: false, email: true, attachEmail: false },

  async signInWithName() {
    return UNSUPPORTED;
  },

  async getCurrentUser() {
    return getValidatedUser();
  },

  async signInWithEmail(email, redirectTo, options) {
    try {
      const client = await createAuthServerClient();
      const { error } = await client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: options?.shouldCreateUser ?? true,
        },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not send email",
      };
    }
  },

  async verifyOtp(email, token) {
    try {
      const client = await createAuthServerClient();
      const { error } = await client.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not verify code",
      };
    }
  },

  async attachEmail() {
    // Every user already has a permanent email identity in this mode —
    // there is no anonymous session to upgrade.
    return UNSUPPORTED;
  },

  async verifyAttachEmailOtp() {
    return UNSUPPORTED;
  },

  async signOut() {
    try {
      const client = await createAuthServerClient();
      await client.auth.signOut();
    } catch {
      // Already signed out, or no cookie to clear.
    }
  },
};

export default supabaseAuth;
