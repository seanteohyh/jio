/**
 * Every tunable number in the recommendation engine lives here.
 *
 * Nothing in `recommend.ts` hard-codes a magic constant, so tuning the app's
 * behaviour is a one-file edit and every change is covered by the existing
 * tests in `tests/recommend.test.ts`.
 */
export const RECOMMEND_CONFIG = {
  /** Relative importance of each score component. */
  weights: {
    cuisineAffinity: 2.0,
    bayesianRating: 1.5,
    budgetFit: 1.0,
    walkPenalty: 1.0,
    varietyBonus: 1.2,
    // Was 1.0; absorbed recoBoost's removed weight (also 1.0) when Reco was
    // retired in favour of Lobang — see CHANGELOG_20260729.md.
    wishlistBoost: 2.0,
  },

  rating: {
    /** Midpoint of the 1–5 rating scale. Scores are centred on this. */
    midpoint: 3,
    /** Divisor that maps a centred rating into roughly [-1, 1]. */
    scale: 2,
    /** Prior mean for the Bayesian smoother. */
    prior: 3.0,
    /** Pseudo-count: how many imaginary average ratings to blend in. */
    priorCount: 3,
  },

  cuisine: {
    /** Bump applied when a cuisine is on the user's explicit likes list. */
    likeBonus: 0.5,
    /** Penalty applied when a cuisine is on the explicit dislikes list. */
    dislikePenalty: 0.5,
  },

  budget: {
    /** Score when the place sits inside the user's budget range. */
    inRange: 1.0,
    /** Score when it is exactly one tier outside. */
    adjacent: 0.4,
    /** Score when it is further out than that. */
    outOfRange: 0.0,
  },

  walk: {
    /** Minutes of walking that cost nothing. */
    freeMinutes: 5,
    /** Penalty per minute beyond the free window. */
    penaltyPerMinute: 0.08,
    /** Hard floor so a very distant place is not infinitely bad. */
    floor: -1.5,
    /** Walk penalty multiplier applied when rain is likely. */
    rainMultiplier: 2,
  },

  variety: {
    /** Bonus for a place the user has never tried. */
    explorationBonus: 0.25,
    /** Days within which a repeat visit is penalised at full strength. */
    recentDays: 3,
    /** Penalty for a place visited inside the recent window. */
    recentPenalty: -1.0,
    /** Days for the repetition penalty to halve. */
    halfLifeDays: 14,
  },

  boosts: {
    /** Added when the place is on the user's want-to-try list. */
    wishlist: 0.4,
  },

  surprise: {
    /** Size of the "good picks" pool. */
    topN: 8,
    /** Probability of drawing from the top pool rather than the long tail. */
    topProbability: 0.8,
  },
} as const;

export type RecommendConfig = typeof RECOMMEND_CONFIG;
