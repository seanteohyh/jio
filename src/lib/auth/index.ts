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
