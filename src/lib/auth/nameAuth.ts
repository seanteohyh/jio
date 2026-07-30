import { createAuthServerClient } from "@/lib/supabase/serverAuth";
import { UNSUPPORTED, type AuthAdapter } from "./index";

/**
 * Name-only sign-in. The least ceremony that still gives distinct users.
 *
 * You type a name and you are in. No email, no password, no provider, no
 * verification step.
 *
 * Underneath it is a Supabase **anonymous** session, which matters more than
 * it sounds. The alternative — rolling our own signed cookie holding a user id
 * — would mean no `auth.uid()`, which would mean every Row Level Security
 * policy in the schema stops working and every query has to run as service
 * role. That trades a bit of sign-up friction for turning off all the access
 * control, which is a bad deal at any price.
 *
 * With an anonymous session you get a real row in `auth.users`, a real UUID, a
 * JWT carrying the `authenticated` role, and all fourteen migrations' worth of
 * RLS still applying exactly as written.
 *
 * The trade-off you are actually accepting:
 *
 *  - **Identity is bound to the browser.** Clear site data and you come back as
 *    a new person with no history. Same on a second device — your phone is a
 *    different user from your laptop.
 *  - **Anyone can claim any name.** There is no secret, so nothing stops
 *    someone typing a colleague's name. Fine for a team that already trusts
 *    each other; not fine if that stops being true.
 *
 * Both are fixed by switching `NEXT_PUBLIC_JIO_AUTH_ADAPTER` to `email`. No
 * other code changes — that is what this adapter layer is for.
 *
 * Requires "Anonymous sign-ins" to be enabled in the Supabase dashboard under
 * Authentication → Providers.
 */
export const nameAuth: AuthAdapter = {
  name: "name",
  capabilities: { name: true, email: false, attachEmail: true },

  async getCurrentUser() {
    try {
      const client = await createAuthServerClient();
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;

      return {
        id: data.user.id,
        email: data.user.email ?? null,
        display_name:
          (data.user.user_metadata?.display_name as string | undefined) ?? null,
      };
    } catch {
      return null;
    }
  },

  async signInWithName(displayName) {
    const name = displayName.trim();
    if (!name) return { ok: false, error: "Put in a name" };
    if (name.length > 40) return { ok: false, error: "That name is too long" };

    try {
      const client = await createAuthServerClient();

      // Already signed in? Treat this as a rename rather than minting a second
      // identity — otherwise refreshing the login page orphans your history.
      const { data: existing } = await client.auth.getUser();
      if (existing.user) {
        await client.auth.updateUser({ data: { display_name: name } });
        await client
          .from("profiles")
          .upsert(
            { user_id: existing.user.id, display_name: name },
            { onConflict: "user_id" }
          );
        return { ok: true };
      }

      const { data, error } = await client.auth.signInAnonymously({
        options: { data: { display_name: name } },
      });

      if (error) {
        // The overwhelmingly likely cause, and not obvious from the raw text.
        if (/anonymous/i.test(error.message)) {
          return {
            ok: false,
            error:
              "Anonymous sign-ins are switched off in Supabase. Enable them " +
              "under Authentication → Providers → Anonymous sign-ins.",
          };
        }
        return { ok: false, error: error.message };
      }

      if (!data.user) {
        return { ok: false, error: "Could not start a session" };
      }

      // The migration 011 trigger will have inserted a placeholder profile,
      // since an anonymous user has no email to derive a name from. Overwrite
      // it with what they actually typed.
      const { error: profileError } = await client
        .from("profiles")
        .upsert(
          { user_id: data.user.id, display_name: name },
          { onConflict: "user_id" }
        );

      if (profileError) return { ok: false, error: profileError.message };

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not sign in",
      };
    }
  },

  async signInWithEmail() {
    return UNSUPPORTED;
  },

  async verifyOtp() {
    return UNSUPPORTED;
  },

  async attachEmail(email, redirectTo) {
    const trimmed = email.trim();
    if (!trimmed) return { ok: false, error: "Put in an email" };

    try {
      const client = await createAuthServerClient();
      const { data: existing } = await client.auth.getUser();

      if (!existing.user) {
        return { ok: false, error: "Sign in with a name first" };
      }
      if (existing.user.email) {
        return {
          ok: false,
          error: "This account already has an email attached",
        };
      }

      // Calling updateUser({ email }) on an anonymous session sends a
      // confirmation to the new address (magic link + a 6-digit code, same
      // dual delivery as ordinary email sign-in). Confirming it attaches the
      // email without changing auth.uid() — the session goes from anonymous
      // to permanent in place, so nothing about this user's existing rows
      // needs to move.
      const { error } = await client.auth.updateUser(
        { email: trimmed },
        { emailRedirectTo: redirectTo }
      );

      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Could not start that",
      };
    }
  },

  async verifyAttachEmailOtp(email, token) {
    try {
      const client = await createAuthServerClient();
      const { error } = await client.auth.verifyOtp({
        email,
        token,
        type: "email_change",
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Could not verify code",
      };
    }
  },

  async signOut() {
    try {
      const client = await createAuthServerClient();
      await client.auth.signOut();
    } catch {
      // Already gone.
    }
  },
};

export default nameAuth;
