import { describe, expect, it } from "vitest";
import { computeFingerprint, FINGERPRINT_TONES } from "@/lib/placeFingerprint";

describe("computeFingerprint", () => {
  it("is deterministic — the same name always computes the same pattern", () => {
    const a = computeFingerprint("Sushi Tei Raffles City");
    const b = computeFingerprint("Sushi Tei Raffles City");
    expect(a).toEqual(b);
  });

  it("mirrors left-right, column 0 matching column 4 and column 1 matching column 3", () => {
    const { cells } = computeFingerprint("Nasi Lemak Ayam Taliwang");
    expect(cells[0]).toEqual(cells[4]);
    expect(cells[1]).toEqual(cells[3]);
  });

  it("always picks a tone from the app's own semantic palette", () => {
    const names = ["Nam Kee Pau", "Joji's Deli", "Bibik Violet", "Din Tai Fung"];
    for (const name of names) {
      const { tone } = computeFingerprint(name);
      expect(FINGERPRINT_TONES).toContain(tone);
    }
  });

  it("gives different names visibly different patterns or tones", () => {
    const a = computeFingerprint("Sushi Tei Raffles City");
    const b = computeFingerprint("Nam Kee Pau");
    expect(a).not.toEqual(b);
  });
});
