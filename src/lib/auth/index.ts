import type { AuthUser } from "@/types";

/**
 * Auth seam.
 *
 * The app asks two questions of auth — "who is this?" and "how do they sign
 * in / out?" — and nothing more. Keeping it behind this interface means
 * swapping Supabase Auth for Clerk, Auth.js, or a company SSO gateway is a
 * one-file job.
 */
export interface AuthAdapter {
  readonly name: string;

  /** The signed-in user, or null. Never throws. */
  getCurrentUser(): Promise<AuthUser | null>;

  /** Send a sign-in email. `redirectTo` is where the magic link lands. */
  signInWithEmail(
    email: string,
    redirectTo: string,
    options?: { shouldCreateUser?: boolean }
  ): Promise<{ ok: boolean; error?: string }>;

  /** Verify a 6-digit code from a sign-in email. */
  verifyOtp(
    email: string,
    token: string
  ): Promise<{ ok: boolean; error?: string }>;

  signOut(): Promise<void>;
}

export class UnauthenticatedError extends Error {
  constructor(message = "UNAUTHENTICATED") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}
