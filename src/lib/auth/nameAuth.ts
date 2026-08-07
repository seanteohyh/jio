import { createAuthServerClient } from "@/lib/supabase/serverAuth";
import { getRepoAsync } from "@/lib/data/repo";
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
 *  - **Anyone can claim any name.** There is no secret, so nothing stops
 *    someone typing a colleague's name — which is also how recovery works.
 *    Fine for a team that already trusts each other; not fine if that stops
 *    being true.
 *
 * Identity is otherwise bound to the browser session — clear site data and
 * you land on a session with no history — but typing your old name again
 * (from this browser or a new one) reclaims it: `signInWithName` below
 * checks for an existing, different profile with the same
 * case/whitespace-normalized name and, on a match, merges that account's
 * data onto the current session instead of forking a new one
 * (CHANGES_20260807.md §4). This is the direct fix for the identity-loss
 * bug's actual damage: whatever caused a session to go stale, retyping your
 * name always gets you back to the same account rather than a fresh one.
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

      // Already signed in? Reuse that session rather than minting a second
      // identity — otherwise refreshing the login page orphans your history.
      const { data: existing } = await client.auth.getUser();
      let userId = existing.user?.id ?? null;
      let isNewSession = false;

      if (!userId) {
        const { data, error } = await client.auth.signInAnonymously();

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
        userId = data.user.id;
        isNewSession = true;
      }

      // CHANGES_20260807.md §4 — does a *different* account already use this
      // name? Case/whitespace-normalized: "Sean" and "sean " are the same
      // identity for matching, even though the stored/displayed name keeps
      // whatever casing was actually typed. If so, this is a claim, not a
      // fresh sign-up or a plain rename: pull that account's data onto the
      // session we're already holding, then retire it. There is no way to
      // instead swap which `auth.uid()` this browser is signed in as — an
      // anonymous session has no password to verify a login against — so
      // "logging in as" someone always works in this direction.
      //
      // This is the fix for the duplicate-account symptom underneath
      // CHANGES_20260807.md §1: previously, typing an existing name from a
      // session with no matching name of its own always fell straight
      // through to a plain rename/sign-up, silently forking a second
      // account with the same display name instead of resolving back to it.
      const { data: profileRows } = await client
        .from("profiles")
        .select("user_id, display_name")
        .neq("user_id", userId);

      const normalized = name.toLowerCase();
      const match = (profileRows ?? []).find(
        (p) => p.display_name.trim().toLowerCase() === normalized
      );

      if (match) {
        const repo = await getRepoAsync();
        await repo.mergeUserAccounts(userId, userId, match.user_id);
      }

      await client.auth.updateUser({ data: { display_name: name } });

      // The migration 011 trigger will have inserted a placeholder profile
      // for a brand-new session, since an anonymous user has no email to
      // derive a name from. Overwrite it with what they actually typed.
      //
      // `onboarded_at` is stamped only for a new session, not left for
      // /welcome. The onboarding screen exists to collect a display name
      // from someone who arrived without one — which is the `email` mode
      // story. In `name` mode the name was just typed on the previous
      // screen (or reused via the claim above), so leaving this null sent
      // every new user to /welcome to confirm a value they had already
      // given. One question, asked once.
      const patch: {
        user_id: string;
        display_name: string;
        onboarded_at?: string;
      } = { user_id: userId, display_name: name };
      if (isNewSession) patch.onboarded_at = new Date().toISOString();

      const { error: profileError } = await client
        .from("profiles")
        .upsert(patch, { onConflict: "user_id" });

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
