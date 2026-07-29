import { config } from "@/lib/config";
import { demoAuth } from "./demoAuth";
import type { AuthAdapter } from "./index";

/**
 * Auth factory. Mirrors `data/repo.ts` — one switch, one seam.
 */

let cached: AuthAdapter | null = null;
let supabaseAuthPromise: Promise<AuthAdapter> | null = null;

async function loadSupabaseAuth(): Promise<AuthAdapter> {
  if (!supabaseAuthPromise) {
    supabaseAuthPromise = import("./supabaseAuth").then((m) => m.supabaseAuth);
  }
  return supabaseAuthPromise;
}

export async function getAuth(): Promise<AuthAdapter> {
  if (cached) return cached;

  switch (config.authAdapter) {
    case "supabase":
      cached = await loadSupabaseAuth();
      break;
    case "demo":
    default:
      cached = demoAuth;
  }

  return cached;
}

export function resetAuth(): void {
  cached = null;
  supabaseAuthPromise = null;
}
