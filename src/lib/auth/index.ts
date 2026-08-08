import type { AuthUser } from "@/types";

export interface AuthResult {
  ok: boolean;
  error?: string;
  /**
   * `signInWithName` only: true when a *different* account already uses this
   * exact name and nothing has happened yet — no merge, no rename — pending
   * the caller saying whether that's them. CHANGES_20260807c.md §3, item 1.
   */
  needsConfirmation?: boolean;
  /** The matched account's exact stored name, for the confirmation prompt's
   *  copy (may differ in case/whitespace from what was typed). */
  matchedName?: string;
  /**
   * True when this call resolved `confirmClaim: false` on an actual match —
   * i.e. two different real people, confirmed, now share a name. The caller
   * (the sign-in route) uses this to notify admins, per §3 item 5; it isn't
   * something `signInWithName` itself sends, since side effects like a push
   * belong at the route layer, not the auth adapter.
   */
  duplicateConfirmed?: boolean;
}

/**
 * Auth seam.
 *
 * The app only ever asks two things — "who is this?" and "how do they get in
 * and out?" — so this stays small.
 *
 * Every method is required rather than optional. An adapter that does not
 * support a sign-in style returns `{ ok: false, error }` instead, which keeps
 * call sites free of capability checks and makes an unsupported path fail with
 * a readable message rather than a TypeError on `undefined`.
 */
export interface AuthAdapter {
  readonly name: string;

  /** What the login page should render. */
  readonly capabilities: {
    /** Sign in by typing a display name. */
    name: boolean;
    /** Sign in with a magic link or emailed code. */
    email: boolean;
    /**
     * Can the current session attach a permanent email to itself? Only
     * meaningful for a name-mode anonymous session — see `attachEmail`.
     */
    attachEmail: boolean;
  };

  /** The signed-in user, or null. Never throws. */
  getCurrentUser(): Promise<AuthUser | null>;

  /**
   * Name-only sign-in. Creates a distinct user with no credentials.
   *
   * `confirmClaim` resolves the case where a different account already has
   * this name (only checked when name-based claim is enabled — see
   * `config.nameClaimEnabled`): omitted on the first attempt, and a match
   * returns `{ ok: false, needsConfirmation: true, matchedName }` without
   * changing anything. Call again with `confirmClaim: true` ("yes, that's
   * me") to merge that account's data onto the current session, or `false`
   * ("no, different person") to sign in as a distinct new account under the
   * same name regardless. Ignored entirely when no match exists.
   */
  signInWithName(
    displayName: string,
    confirmClaim?: boolean
  ): Promise<AuthResult>;

  /** Send a sign-in email. `redirectTo` is where the magic link lands. */
  signInWithEmail(
    email: string,
    redirectTo: string,
    options?: { shouldCreateUser?: boolean }
  ): Promise<AuthResult>;

  /** Verify a 6-digit code from a sign-in email. */
  verifyOtp(email: string, token: string): Promise<AuthResult>;

  /**
   * Attach a permanent email to the *current* session without minting a new
   * identity — `auth.uid()` stays the same, so every bit of this user's
   * history (visits, votes, prefs, wishlist) carries over automatically.
   * This is the durable-identity on-ramp for a name-mode admin (and later,
   * for anyone) rather than a full switch to email-mode for everyone.
   */
  attachEmail(email: string, redirectTo: string): Promise<AuthResult>;

  /** Verify the 6-digit code from an `attachEmail` confirmation email. */
  verifyAttachEmailOtp(email: string, token: string): Promise<AuthResult>;

  signOut(): Promise<void>;
}

export class UnauthenticatedError extends Error {
  constructor(message = "UNAUTHENTICATED") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/** Shared rejection for a sign-in style an adapter does not implement. */
export const UNSUPPORTED: AuthResult = {
  ok: false,
  error: "That sign-in method is not enabled on this deployment",
};
