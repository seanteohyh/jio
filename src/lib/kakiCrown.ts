/**
 * Log 6 Part B — the home-kaki crown rule, worked out with Sean specifically
 * for this log: someone who's simply the most active/adventurous/novel
 * person across several of their groups would win the same award in every
 * one of their kakis every month, which flattens the feature.
 *
 * Deliberately stateless — "no persisted streak state, no cooldown," per
 * the log's own recompute-cadence note — so this is a pure function over
 * already-fetched rankings, called fresh on every page load rather than
 * anything written by the monthly cron. Reused identically for all three
 * award kinds (Most Active / Adventurer / Trailblazer — extended to
 * Trailblazer beyond what the log originally specced, per later approval).
 */

export interface CrownedAward {
  user_id: string;
  value: number;
  /** Total kakis (including this one) where this user is #1 for this
   *  award this month. Only ever >1 when this user is the one crowned
   *  here (never set on a passed-to-runner-up result) — that's what
   *  drives the small streak badge next to their name. */
  streak: number;
  /** Set only when the raw #1 here isn't crowned here because some other
   *  kaki is their "home" for this award — the crowned user is the
   *  runner-up instead, and this describes who got passed over and why. */
  passedNote: { leaderUserId: string; leaderValue: number; homeKakiName: string } | null;
}

export interface OtherKakiStanding {
  kakiId: string;
  kakiName: string;
  /** ISO-ish string, used only for the tie-break sort below. */
  createdAt: string;
  value: number;
}

/**
 * `ranking` — this kaki's own full ranking for one award, highest first
 * (`KakiMetrics.activeRanking`/`adventurerRanking`/`trailblazerRanking`,
 * mapped to a common {user_id, value} shape by the caller).
 *
 * `winnerElsewhere` — every OTHER kaki (this one excluded) where
 * `ranking[0]`'s user is ALSO #1 for this same award this month, with
 * their raw value there and that kaki's name/created_at. Empty when the
 * winner isn't #1 anywhere else, which is the common case and skips
 * straight to a normal crowning below.
 *
 * Tie-break (flagged in the log as an assumption pending confirmation,
 * not silently decided): equal raw values across two-plus candidate homes
 * — the earliest-created kaki wins.
 */
export function resolveKakiAwardCrown(
  currentKakiId: string,
  currentKakiCreatedAt: string,
  ranking: { user_id: string; value: number }[],
  winnerElsewhere: OtherKakiStanding[]
): CrownedAward | null {
  if (ranking.length === 0) return null;
  const winner = ranking[0];

  if (winnerElsewhere.length === 0) {
    return { user_id: winner.user_id, value: winner.value, streak: 1, passedNote: null };
  }

  const homes = [
    { kakiId: currentKakiId, createdAt: currentKakiCreatedAt, value: winner.value },
    ...winnerElsewhere.map((w) => ({
      kakiId: w.kakiId,
      createdAt: w.createdAt,
      value: w.value,
    })),
  ];
  homes.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return a.createdAt.localeCompare(b.createdAt);
  });
  const home = homes[0];

  if (home.kakiId === currentKakiId) {
    return { user_id: winner.user_id, value: winner.value, streak: homes.length, passedNote: null };
  }

  // Not the home kaki — the crown passes to this kaki's own runner-up,
  // shown exactly as if they were the natural #1 (full-size treatment, no
  // visual demotion — the caller's job, not this function's).
  const runnerUp = ranking[1];
  if (!runnerUp) return null;

  const homeStanding = winnerElsewhere.find((w) => w.kakiId === home.kakiId)!;
  return {
    user_id: runnerUp.user_id,
    value: runnerUp.value,
    streak: 1,
    passedNote: {
      leaderUserId: winner.user_id,
      leaderValue: winner.value,
      homeKakiName: homeStanding.kakiName,
    },
  };
}
