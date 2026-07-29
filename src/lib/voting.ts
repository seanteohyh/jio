import type { EventVote } from "@/types";

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
