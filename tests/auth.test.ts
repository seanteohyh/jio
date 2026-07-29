import { describe, expect, it } from "vitest";
import { demoAuth } from "@/lib/auth/demoAuth";
import { UNSUPPORTED } from "@/lib/auth/index";
import type { AuthAdapter } from "@/lib/auth/index";

/**
 * Shape checks on the auth adapters.
 *
 * The failure worth guarding against: someone adds a sign-in style to one
 * adapter and forgets the others, so switching modes produces a TypeError on
 * `undefined` at the moment a user tries to log in. Every adapter must answer
 * every method, refusing politely where it does not support one.
 */

const METHODS = [
  "getCurrentUser",
  "signInWithName",
  "signInWithEmail",
  "verifyOtp",
  "signOut",
] as const;

async function adapters(): Promise<[string, AuthAdapter][]> {
  const { nameAuth } = await import("@/lib/auth/nameAuth");
  const { supabaseAuth } = await import("@/lib/auth/supabaseAuth");
  return [
    ["demo", demoAuth],
    ["name", nameAuth],
    ["email", supabaseAuth],
  ];
}

describe("auth adapters", () => {
  it("all implement every method on the interface", async () => {
    for (const [label, adapter] of await adapters()) {
      for (const method of METHODS) {
        expect(
          typeof (adapter as unknown as Record<string, unknown>)[method],
          `${label} is missing ${method}`
        ).toBe("function");
      }
    }
  });

  it("all declare what the login page should render", async () => {
    for (const [label, adapter] of await adapters()) {
      expect(adapter.capabilities, `${label} has no capabilities`).toBeDefined();
      expect(typeof adapter.capabilities.name).toBe("boolean");
      expect(typeof adapter.capabilities.email).toBe("boolean");

      // An adapter offering neither would render an empty login page.
      expect(
        adapter.capabilities.name || adapter.capabilities.email,
        `${label} offers no way to sign in`
      ).toBe(true);
    }
  });

  it("refuses unsupported styles instead of throwing", async () => {
    const { nameAuth } = await import("@/lib/auth/nameAuth");
    const { supabaseAuth } = await import("@/lib/auth/supabaseAuth");

    // Name mode has no email flow, and vice versa. Both must decline in a way
    // the sign-in route can turn into a message.
    await expect(
      nameAuth.signInWithEmail("a@b.com", "/")
    ).resolves.toEqual(UNSUPPORTED);
    await expect(nameAuth.verifyOtp("a@b.com", "123456")).resolves.toEqual(
      UNSUPPORTED
    );
    await expect(supabaseAuth.signInWithName("Sean")).resolves.toEqual(
      UNSUPPORTED
    );
  });

  it("rejects an empty or oversized name before touching the network", async () => {
    const { nameAuth } = await import("@/lib/auth/nameAuth");

    const blank = await nameAuth.signInWithName("   ");
    expect(blank.ok).toBe(false);
    expect(blank.error).toMatch(/name/i);

    const huge = await nameAuth.signInWithName("x".repeat(41));
    expect(huge.ok).toBe(false);
    expect(huge.error).toMatch(/too long/i);
  });

  it("signs the demo user in without any credentials", async () => {
    const user = await demoAuth.getCurrentUser();

    expect(user).not.toBeNull();
    expect(user?.id).toBeTruthy();
  });
});
