import type { EventDetail, EventVote } from "@/types";

/**
 * Borda count for ranked-choice lunch votes.
 *
 * Plain plurality voting picks the option with the loudest minority. Borda
 * asks everyone to rank, then rewards broad acceptability — which is what you
 * actually want when six people have to eat together.
 *
 * A voter who ranks N options gives (N - rank + 1) points to each: their first
 * choice gets N, their last gets 1. Partial ballots are fine and are scaled by
 * that voter's own ballot length, so ranking three options does not give you
 * more influence than ranking all six.
 */

export interface WinnerResult {
  winnerId: string | null;
  points: number;
  firstPlace: number;
  /** True when the winner was chosen at random among tied options. */
  tieBroken: boolean;
}

export function computeBorda(
  votes: EventVote[],
  optionIds: string[]
): Record<string, number> {
  const options = new Set(optionIds);
  const points: Record<string, number> = {};
  for (const id of optionIds) points[id] = 0;

  // Ballots are grouped per voter so N is that voter's own ballot length.
  const byVoter = new Map<string, EventVote[]>();
  for (const vote of votes) {
    if (!options.has(vote.place_id)) continue;
    const bucket = byVoter.get(vote.user_id);
    if (bucket) bucket.push(vote);
    else byVoter.set(vote.user_id, [vote]);
  }

  for (const ballot of byVoter.values()) {
    // Re-rank each surviving ballot 1..n before scoring.
    //
    // Stored ranks can have gaps — an option gets removed from the event
    // after someone voted, and their ballot is left ranked 1, 3, 4. Scoring
    // the raw ranks would then hand out negative or zero points and quietly
    // corrupt the count. Sorting and re-numbering keeps the voter's stated
    // order while making the arithmetic well-formed.
    const ordered = [...ballot].sort((a, b) => a.rank - b.rank);
    const n = ordered.length;
    ordered.forEach((vote, index) => {
      points[vote.place_id] += n - (index + 1) + 1;
    });
  }

  return points;
}

export function firstPlaceCounts(
  votes: EventVote[],
  optionIds: string[]
): Record<string, number> {
  const options = new Set(optionIds);
  const counts: Record<string, number> = {};
  for (const id of optionIds) counts[id] = 0;

  for (const vote of votes) {
    if (!options.has(vote.place_id)) continue;
    if (vote.rank === 1) counts[vote.place_id] += 1;
  }

  return counts;
}

/**
 * Decide the winner.
 *
 * Ties break on Borda points first, then on how many people put the option
 * first, then at random. `rand` is injectable so the tests are deterministic.
 */
export function computeWinner(
  votes: EventVote[],
  optionIds: string[],
  rand: () => number = Math.random
): WinnerResult {
  if (optionIds.length === 0) {
    return { winnerId: null, points: 0, firstPlace: 0, tieBroken: false };
  }

  const relevant = votes.filter((v) => optionIds.includes(v.place_id));
  if (relevant.length === 0) {
    return { winnerId: null, points: 0, firstPlace: 0, tieBroken: false };
  }

  const points = computeBorda(relevant, optionIds);
  const firsts = firstPlaceCounts(relevant, optionIds);

  const maxPoints = Math.max(...optionIds.map((id) => points[id]));
  const topByPoints = optionIds.filter((id) => points[id] === maxPoints);

  if (topByPoints.length === 1) {
    const id = topByPoints[0];
    return {
      winnerId: id,
      points: points[id],
      firstPlace: firsts[id],
      tieBroken: false,
    };
  }

  const maxFirsts = Math.max(...topByPoints.map((id) => firsts[id]));
  const topByFirsts = topByPoints.filter((id) => firsts[id] === maxFirsts);

  if (topByFirsts.length === 1) {
    const id = topByFirsts[0];
    return {
      winnerId: id,
      points: points[id],
      firstPlace: firsts[id],
      tieBroken: true,
    };
  }

  const id = topByFirsts[Math.floor(rand() * topByFirsts.length)] ?? topByFirsts[0];
  return {
    winnerId: id,
    points: points[id],
    firstPlace: firsts[id],
    tieBroken: true,
  };
}

/** True while a hidden-vote Jio's standing is still supposed to be blind —
 *  §14. `hide_votes` only applies while open; once closed, the whole point
 *  was to blind the in-progress standing, not the result, so it reveals
 *  normally through the same resolved-vote moment every other Jio uses. */
export function tallyIsHidden(event: {
  hide_votes?: boolean;
  status: string;
}): boolean {
  return Boolean(event.hide_votes) && event.status === "open";
}

/**
 * Every route that returns an `EventDetail` after a mutation (casting a
 * ballot, adding an option, RSVPing, …) has to run its response through this
 * — not just the GET detail route — since the client refreshes its local
 * copy from whatever a POST/PATCH echoes back. Missing even one call site
 * would leak the hidden standing through that endpoint alone.
 *
 * `voter_count` is populated either way so the client never has to fall back
 * to counting `votes` itself, which is empty exactly when it would need to.
 */
export function redactHiddenVotes(event: EventDetail): EventDetail {
  const voterCount = new Set(event.votes.map((v) => v.user_id)).size;

  if (!tallyIsHidden(event)) {
    return { ...event, voter_count: voterCount };
  }

  return { ...event, votes: [], tally: {}, voter_count: voterCount };
}

/**
 * Whether a cast ballot should still count toward "ready to close" once a
 * new place option has been added since it was cast — bug report item 4:
 * adding a place mid-vote shouldn't let a stale ballot silently count as
 * "voted" for a place they never actually saw, so a fresh place deserves a
 * fresh look at everyone's ranking before the group can be said to agree
 * on anything.
 *
 * This is deliberately narrow: it only ever gates `computeReadyToClose`,
 * below. The vote-deadline sweep (`closeEventsPastVoteDeadline`) ignores
 * staleness entirely and closes with whatever ballots exist — "give the
 * opportunity to revote, but the deadline still wins" per the bug report,
 * not "block closing indefinitely until everyone revotes."
 *
 * `optionsChangedAt` of `null`/`undefined` means nothing's been added since
 * the Jio's own options were first set, so nothing can ever be stale.
 * `voteCastAt` missing (a ballot with no timestamp, which shouldn't happen
 * in practice) is treated as stale rather than assumed fresh — the whole
 * point is caution near a race, not the benefit of the doubt.
 */
export function isVoteStale(
  voteCastAt: string | null | undefined,
  optionsChangedAt: string | null | undefined
): boolean {
  if (!optionsChangedAt) return false;
  if (!voteCastAt) return true;
  return new Date(voteCastAt).getTime() < new Date(optionsChangedAt).getTime();
}

/**
 * "Every current participant has answered, and everyone who confirmed going
 * has actually voted" — the exact condition this Jio used to auto-close on
 * the instant it became true. A real bug report: a Jio anyone can still
 * join via its own share link (or, for a Kaki-linked Jio, just by being a
 * Kaki member) can never have a genuinely final population — someone opens
 * the link, joins, votes, and if everyone *already* joined had answered,
 * the Jio closed right then, locking out whoever was about to open that
 * same link a moment later. There's no way to distinguish "everyone who
 * will ever join has already voted" from "everyone who's joined so far has
 * voted" from inside this check alone, so closing on it automatically was
 * fundamentally unsafe for any Jio someone else could still join.
 *
 * This condition itself is still useful — just not as an auto-close
 * trigger any more. It's surfaced as `EventDetail.readyToClose`, a plain
 * signal the host's own page turns into a prompt ("Everyone's answered —
 * ready to close?"), with the host tapping "Close with the vote" doing the
 * actual close explicitly. See CHANGES log: "Jio keeps closing whilst new
 * members trying to add their votes in."
 */
export function computeReadyToClose(
  participants: string[],
  rsvps: { user_id: string; response: string }[],
  votes: EventVote[],
  optionsChangedAt: string | null | undefined
): boolean {
  const rsvpByUser = new Map(rsvps.map((r) => [r.user_id, r.response]));

  for (const userId of participants) {
    const response = rsvpByUser.get(userId);
    if (response !== "yes" && response !== "no") return false;
  }

  for (const userId of participants) {
    if (rsvpByUser.get(userId) !== "yes") continue;
    const ownVote = votes.find((v) => v.user_id === userId);
    if (!ownVote || isVoteStale(ownVote.created_at, optionsChangedAt)) {
      return false;
    }
  }

  return true;
}
