import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guardrails on the Supabase client factories.
 *
 * The failure these exist to prevent: a refactor makes the user-facing server
 * client "helpfully" fall back to the service-role key when the anon key is
 * missing. Everything keeps working in development, and Row Level Security is
 * silently off in production. Nothing else in the test suite would catch that.
 */

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("createServerClient", () => {
  it("uses the anon key even when a service-role key is available", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    const captured: string[] = [];
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: (_url: string, key: string) => {
        captured.push(key);
        return {};
      },
    }));

    const { createServerClient } = await import("@/lib/supabase/server");
    createServerClient();

    expect(captured).toEqual(["anon-key"]);
    expect(captured).not.toContain("service-key");
  });

  it("throws rather than falling back when the anon key is missing", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => ({}),
    }));

    const { createServerClient } = await import("@/lib/supabase/server");

    expect(() => createServerClient()).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/
    );
  });

  it("throws when the URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => ({}),
    }));

    const { createServerClient } = await import("@/lib/supabase/server");

    expect(() => createServerClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe("createServiceRoleClient", () => {
  it("uses the service-role key", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    const captured: string[] = [];
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: (_url: string, key: string) => {
        captured.push(key);
        return {};
      },
    }));

    const { createServiceRoleClient } = await import(
      "@/lib/supabase/serviceClient"
    );
    createServiceRoleClient();

    expect(captured).toEqual(["service-key"]);
  });

  it("throws when the service-role key is missing", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => ({}),
    }));

    const { createServiceRoleClient } = await import(
      "@/lib/supabase/serviceClient"
    );

    expect(() => createServiceRoleClient()).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/
    );
  });

  it("throws when the URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => ({}),
    }));

    const { createServiceRoleClient } = await import(
      "@/lib/supabase/serviceClient"
    );

    expect(() => createServiceRoleClient()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/
    );
  });
});
