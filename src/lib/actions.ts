import type { Repo } from "./data";

/**
 * Daily Activity Log's action taxonomy (Daily_Activity_Log_Spec.html §5) —
 * the v1 set of instrumented write paths. Add to this union, not a bare
 * string, so a typo in a call site is a type error rather than a silent
 * miscount in the admin dashboard.
 */
export type ActionType =
  | "jio.hosted"
  | "jio.voted"
  | "jio.rsvp"
  | "place.visited"
  | "place.reviewed"
  | "lobang.sent"
  | "place.wishlisted"
  | "place.created"
  | "kaki.created"
  | "report.filed"
  | "place.flagged";

/**
 * Fire-and-forget action-log write — §4 is explicit that logging must
 * never fail the real action it's recording, same "courtesy on top of the
 * real write" shape `sendPushToUsers` already established for push. Every
 * call site places this after its own successful write, same convention.
 */
export async function logAction(
  repo: Repo,
  userId: string,
  action: ActionType,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await repo.logAction(userId, action, metadata ?? null);
  } catch (error) {
    console.log(
      `[actions] failed to log "${action}" for ${userId}:`,
      error instanceof Error ? error.message : error
    );
  }
}
