import { describe, expect, it } from "vitest";
import { extractPostalCode } from "@/lib/onemap";

/**
 * `extractPostalCode` is the one pure piece of `onemap.ts` worth testing on
 * its own — the network-calling functions (`geocodeAddress`,
 * `searchOneMap`) stay untested, same boundary `googlePlaces.test.ts`
 * already documents. This covers a real bug: an office added with
 * "8 Marina Blvd, S018981" silently skipped the postal-code-first lookup
 * because a plain `\b\d{6}\b` regex doesn't match digits directly preceded
 * by a letter.
 */
describe("extractPostalCode", () => {
  it("finds a bare 6-digit code preceded by a space", () => {
    expect(
      extractPostalCode("51 Bras Basah Rd, Singapore 189554")
    ).toBe("189554");
  });

  it("finds a code with the common leading-S notation, no space", () => {
    expect(extractPostalCode("8 Marina Blvd, S018981")).toBe("018981");
  });

  it("is case-insensitive on the S prefix", () => {
    expect(extractPostalCode("8 Marina Blvd, s018981")).toBe("018981");
  });

  it("returns null when no 6-digit code is present", () => {
    expect(extractPostalCode("Paragon, 290 Orchard Rd, #04-31")).toBeNull();
  });

  it("does not match a run of 6 digits that's part of a longer number", () => {
    expect(extractPostalCode("Unit #04-31234567")).toBeNull();
  });

  it("returns the digits alone, never the S prefix, so the search hits the bare code", () => {
    const result = extractPostalCode("S018981");
    expect(result).toBe("018981");
    expect(result).not.toContain("S");
  });
});
