import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE } from "@/lib/constants";

/**
 * Adding a new office never actually changed anything the app uses — every
 * write path that needs "the" office and wasn't given one explicitly falls
 * back to the same fixed DEFAULT_OFFICE.id, so a second row alongside it
 * changes nothing. Editing (or removing) the existing office in place is
 * what actually moves it — these are the repo methods behind that fix.
 */

beforeEach(() => {
  resetDemoStore();
});

describe("updateOffice", () => {
  it("edits the existing office's name and coordinates in place", async () => {
    const updated = await demoRepo.updateOffice(DEFAULT_OFFICE.id, {
      name: "MBFC Tower 1",
      address: "8 Marina Blvd, Singapore 018981",
      lat: 1.2798,
      lng: 103.8517,
    });

    expect(updated.name).toBe("MBFC Tower 1");
    expect(updated.lat).toBe(1.2798);
    expect(updated.lng).toBe(103.8517);

    // The same id is what every default-office fallback keys off, so the
    // change has to be visible through a fresh listOffices() call too, not
    // just on the object updateOffice happened to return.
    const offices = await demoRepo.listOffices();
    const office = offices.find((o) => o.id === DEFAULT_OFFICE.id);
    expect(office?.name).toBe("MBFC Tower 1");
    expect(office?.lat).toBe(1.2798);
  });

  it("supports a partial patch, leaving fields not sent untouched", async () => {
    const before = await demoRepo.listOffices();
    const original = before.find((o) => o.id === DEFAULT_OFFICE.id)!;

    const updated = await demoRepo.updateOffice(DEFAULT_OFFICE.id, {
      name: "Renamed Only",
    });

    expect(updated.name).toBe("Renamed Only");
    expect(updated.lat).toBe(original.lat);
    expect(updated.lng).toBe(original.lng);
    expect(updated.address).toBe(original.address);
  });

  it("throws for an office id that does not exist", async () => {
    await expect(
      demoRepo.updateOffice("no-such-office", { name: "Ghost HQ" })
    ).rejects.toThrow();
  });
});

describe("deleteOffice", () => {
  it("removes the office from listOffices()", async () => {
    const created = await demoRepo.createOffice({
      name: "Temporary Annex",
      address: null,
      lat: 1.3,
      lng: 103.85,
    });

    await demoRepo.deleteOffice(created.id);

    const offices = await demoRepo.listOffices();
    expect(offices.some((o) => o.id === created.id)).toBe(false);
  });

  it("is a no-op for an office id that does not exist", async () => {
    await expect(demoRepo.deleteOffice("no-such-office")).resolves.not.toThrow();
  });
});
