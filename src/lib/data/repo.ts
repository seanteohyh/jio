import { config } from "@/lib/config";
import { demoRepo } from "./demoRepo";
import type { Repo } from "./index";

/**
 * Repository factory.
 *
 * This is the one place that knows which storage backend is in play. To add
 * another — plain Postgres, PlanetScale, Firebase, a REST backend — write a
 * file that satisfies `Repo`, add a value to `DataAdapter` in
 * `lib/config/index.ts`, and add a case here. No page or API route changes.
 */

let repoInstance: Repo | null = null;
let supabaseRepoPromise: Promise<Repo> | null = null;

async function loadSupabaseRepo(): Promise<Repo> {
  if (!supabaseRepoPromise) {
    // Dynamic import so demo mode never pulls the Supabase client into the
    // bundle, and so a missing Supabase env var cannot break a demo build.
    supabaseRepoPromise = import("./supabaseRepo").then((m) => m.supabaseRepo);
  }
  return supabaseRepoPromise;
}

/**
 * Synchronous accessor. Demo mode only.
 *
 * The Supabase repo needs an async cookie read to build its client, so there
 * is no honest synchronous version of it. Throwing here is better than
 * returning a half-initialised repo.
 */
export function getRepo(): Repo {
  if (config.dataAdapter === "demo") {
    repoInstance = demoRepo;
    return repoInstance;
  }
  throw new Error(
    "The Supabase repo requires async initialisation. Use getRepoAsync() instead."
  );
}

/** The accessor everything should use. Works in every mode. */
export async function getRepoAsync(): Promise<Repo> {
  if (repoInstance) return repoInstance;

  switch (config.dataAdapter) {
    case "demo":
      repoInstance = demoRepo;
      break;
    case "supabase":
      repoInstance = await loadSupabaseRepo();
      break;
    default:
      repoInstance = demoRepo;
  }

  return repoInstance;
}

/** Test seam: forget the memoised instance. */
export function resetRepo(): void {
  repoInstance = null;
  supabaseRepoPromise = null;
}

export type { Repo };
