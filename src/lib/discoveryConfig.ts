/**
 * Tunable constants behind the co-attendance ranking in the teammate
 * pickers — docs/user-discovery.md §4.2 / CHANGES_20260818.md §3. Mirrors
 * `recommendConfig.ts`: nothing in `listAllUsers` hard-codes a magic
 * number, so tuning this is a one-file edit.
 */
export const DISCOVERY_CONFIG = {
  coAttendance: {
    /**
     * Recency-decay half-life, in days. Someone you ate with twice last
     * week outranks someone you ate with ten times last year — a guess per
     * the doc, worth revisiting against real data once there is any.
     */
    halfLifeDays: 30,
  },
};
