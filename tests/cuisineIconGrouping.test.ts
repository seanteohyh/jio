import { describe, expect, it } from "vitest";
import { iconFor } from "@/components/kakis/CuisinePlate";
import {
  BakeryIcon,
  KopiIcon,
  MushroomIcon,
  NoodleBowlIcon,
  ShieldIcon,
  WokIcon,
} from "@/components/icons";
import { DEFAULT_CUISINE_SEED } from "@/lib/constants";

/**
 * UX review log #20's grouping table, as implemented for #24's cuisine
 * plate: every one of the 18 seeded cuisine tags maps to exactly one of
 * the shared food icons (or the certification shield for Halal).
 */
describe("iconFor — cuisine-to-icon grouping", () => {
  it("maps every seeded cuisine tag to a defined icon", () => {
    for (const { slug } of DEFAULT_CUISINE_SEED) {
      expect(iconFor(slug)).toBeDefined();
    }
  });

  it("groups hawker/noodle cuisines under NoodleBowlIcon", () => {
    for (const slug of [
      "chinese",
      "japanese",
      "korean",
      "thai",
      "vietnamese",
      "local",
      "food_court",
      "traditional",
    ]) {
      expect(iconFor(slug)).toBe(NoodleBowlIcon);
    }
  });

  it("groups Malay/Indian under WokIcon", () => {
    expect(iconFor("malay")).toBe(WokIcon);
    expect(iconFor("indian")).toBe(WokIcon);
  });

  it("groups Western/Italian/Dessert/Fast Food under BakeryIcon", () => {
    for (const slug of ["western", "italian", "dessert", "fast_food"]) {
      expect(iconFor(slug)).toBe(BakeryIcon);
    }
  });

  it("groups Cafe/Modern under KopiIcon", () => {
    expect(iconFor("cafe")).toBe(KopiIcon);
    expect(iconFor("modern")).toBe(KopiIcon);
  });

  it("gives Vegetarian its own MushroomIcon", () => {
    expect(iconFor("vegetarian")).toBe(MushroomIcon);
  });

  it("gives Halal the certification ShieldIcon, not a food picture", () => {
    expect(iconFor("halal")).toBe(ShieldIcon);
  });
});
