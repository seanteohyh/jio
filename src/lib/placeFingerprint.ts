/**
 * A generative "place fingerprint" — same trick as a GitHub identicon or a
 * Spotify albumless-playlist tile: a 5×5 grid, mirrored left-right for
 * symmetry, filled from a hash of the place's own name, in one of the app's
 * own semantic hues rather than an arbitrary colour. Deterministic — a given
 * place always computes the exact same pattern, everywhere, with zero photo
 * required.
 *
 * Shared by every surface that shows this pattern (the shareable result
 * ticket's canvas draw, and `PlaceFingerprint`'s inline-SVG rendering
 * everywhere else a place appears) so a given name always resolves to
 * pixel-identical cells and tone regardless of which one drew it.
 */

/** Deliberately the app's own semantic hues (ember/sage/slate/amber), not
 *  arbitrary colours, so a generated mark always reads as on-brand. */
export const FINGERPRINT_TONES = [
  "#c0392b", // ember
  "#517351", // sage
  "#4f6e88", // slate
  "#be7722", // amber
] as const;

/** The fingerprint's own grounded centre-dot colour — always present, never
 *  hash-driven, echoing the icon set's "every signature dot is grounded on
 *  the shape it sits on" rule. */
export const FINGERPRINT_DOT = "#3d342c";

/** A small deterministic string hash → seeded PRNG (mulberry32). */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Fingerprint {
  /** `cells[col][row]`, a 5×5 grid already mirrored left-right. */
  cells: boolean[][];
  /** One of `FINGERPRINT_TONES`, hash-picked. */
  tone: string;
}

const GRID_SIZE = 5;

export function computeFingerprint(seed: string): Fingerprint {
  const rand = seededRandom(seed);
  const tone = FINGERPRINT_TONES[Math.floor(rand() * FINGERPRINT_TONES.length)];

  // Generate columns 0-2 (left half + centre), mirror onto 3-4.
  const generated: boolean[][] = [];
  for (let col = 0; col < 3; col++) {
    generated[col] = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      generated[col][row] = rand() > 0.5;
    }
  }

  const cells: boolean[][] = [];
  for (let col = 0; col < GRID_SIZE; col++) {
    const sourceCol = col < 3 ? col : GRID_SIZE - 1 - col;
    cells[col] = generated[sourceCol];
  }

  return { cells, tone };
}
