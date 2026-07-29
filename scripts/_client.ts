import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Shared setup for the seed scripts.
 *
 * These run outside Next.js, so nothing has loaded `.env.local` for them.
 * A tiny parser is less friction than adding dotenv as a dependency for
 * three scripts.
 */

export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      const contents = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of contents.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index === -1) continue;
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        // Real environment variables win over the file.
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {
      // No such file. Fine.
    }
  }
}

/**
 * Service-role client for seeding.
 *
 * Returns null rather than throwing when credentials are missing, so the
 * scripts can print a friendly message and exit 0 instead of failing a
 * pipeline that never intended to seed anything.
 */
export function serviceClient(): SupabaseClient | null {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log(
      "\n  Supabase is not configured, so there is nothing to seed.\n" +
        "  Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.\n"
    );
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const DEFAULT_OFFICE_ID = "00000000-0000-0000-0000-000000000001";
