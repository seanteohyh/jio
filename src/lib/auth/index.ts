import type { AuthUser } from "@/types";

export interface AuthResult {
  ok: boolean;
  error?: string;
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

  /** Name-only sign-in. Creates a distinct user with no credentials. */
  signInWithName(displayName: string): Promise<AuthResult>;

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
