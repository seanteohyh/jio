import { config } from "@/lib/config";
import { demoAuth } from "./demoAuth";
import type { AuthAdapter } from "./index";

/**
 * Auth factory. Mirrors `data/repo.ts` — one switch, one seam.
 *
 * Moving from name-only to magic links is a single environment variable:
 *   NEXT_PUBLIC_JIO_AUTH_ADAPTER=email
 *
 * Nothing else changes. Existing users keep their ids, their history and their
 * display names, because both adapters sit on the same `auth.users` table.
 */

let cached: AuthAdapter | null = null;
const loaders: Record<string, Promise<AuthAdapter> | undefined> = {};

function load(
  key: string,
  importer: () => Promise<AuthAdapter>
): Promise<AuthAdapter> {
  if (!loaders[key]) loaders[key] = importer();
  return loaders[key]!;
}

export async function getAuth(): Promise<AuthAdapter> {
  if (cached) return cached;

  switch (config.authAdapter) {
    case "name":
      cached = await load("name", () =>
        import("./nameAuth").then((m) => m.nameAuth)
      );
      break;
    case "email":
      cached = await load("email", () =>
        import("./supabaseAuth").then((m) => m.supabaseAuth)
      );
      break;
    case "demo":
    default:
      cached = demoAuth;
  }

  return cached;
}

export function resetAuth(): void {
  cached = null;
  for (const key of Object.keys(loaders)) delete loaders[key];
}
