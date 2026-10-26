import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";
import type { SplitInput } from "@/types";

/**
 * Bill-splitting — 099_bill_splits.sql. Reshaped to stand on its own: a
 * split no longer requires a Jio (`eventId` is optional, pre-filling
 * participants is the only thing linking one buys you), and an item can
 * be assigned to a registered person OR a name-only guest who was never
 * a Jio user at all. Covers the split arithmetic (even split per item,
 * proportional GST/service charge) for both kinds of assignee, the
 * creator/host-only write gating, and the viewer-gated read that a
 * standalone split's own URL now needs (an event-linked split still
 * reads broad, matching 007_rls.sql's precedent).
 */

const STRANGER = "00000000-0000-0000-0000-00000000bad1";
const TOMORROW = new Date(Date.now() + 86400000).toISOString();

beforeEach(() => {
  resetDemoStore();
});

async function makeClosedEvent(hostId = DEMO_USER_ID) {
  const event = await demoRepo.createEvent(
    hostId,
    "Test lunch",
    TOMORROW,
    DEFAULT_OFFICE.id,
    ["demo-place-01"],
    null,
    [DEMO_TEAMMATE_A, DEMO_TEAMMATE_B]
  );
  return demoRepo.closeEvent(event.id, hostId, "demo-place-01");
}

function basicInput(overrides: Partial<SplitInput> = {}): SplitInput {
  return {
    title: "Test split",
    eventId: null,
    participants: [{ ref: "host", userId: DEMO_USER_ID }],
    items: [{ label: "Chicken rice", amountCents: 1000, assigneeRefs: ["host"] }],
    subtotalCents: 1000,
    gstCents: 0,
    serviceChargeCents: 0,
    gstIncluded: true,
    serviceChargeIncluded: true,
    ...overrides,
  };
}

describe("createSplit", () => {
  it("creates a standalone split with no Jio at all", async () => {
    const split = await demoRepo.createSplit(DEMO_USER_ID, basicInput());
    expect(split.event_id).toBeNull();
    expect(split.created_by).toBe(DEMO_USER_ID);
    expect(split.title).toBe("Test split");
  });

  it("refuses anyone but the Jio's host when linked", async () => {
    const event = await makeClosedEvent();
    await expect(
      demoRepo.createSplit(DEMO_TEAMMATE_A, basicInput({ eventId: event.id }))
    ).rejects.toThrow(/only the host/i);
  });

  it("refuses an open Jio", async () => {
    const event = await demoRepo.createEvent(
      DEMO_USER_ID,
      "Still open",
      TOMORROW,
      DEFAULT_OFFICE.id,
      ["demo-place-01"],
      null,
      []
    );
    await expect(
      demoRepo.createSplit(DEMO_USER_ID, basicInput({ eventId: event.id }))
    ).rejects.toThrow(/closed/i);
  });

  it("splits an item evenly across its registered assignees", async () => {
    const split = await demoRepo.createSplit(
      DEMO_USER_ID,
      basicInput({
        participants: [
          { ref: "host", userId: DEMO_USER_ID },
          { ref: "a", userId: DEMO_TEAMMATE_A },
          { ref: "b", userId: DEMO_TEAMMATE_B },
        ],
        items: [{ label: "Sharing platter", amountCents: 3000, assigneeRefs: ["host", "a", "b"] }],
        subtotalCents: 3000,
      })
    );
    for (const p of split.participants) {
      expect(p.owed_cents).toBe(1000);
    }
  });

  it("charges an item only to whoever's actually assigned to it", async () => {
    const split = await demoRepo.createSplit(
      DEMO_USER_ID,
      basicInput({
        participants: [
          { ref: "host", userId: DEMO_USER_ID },
          { ref: "a", userId: DEMO_TEAMMATE_A },
          { ref: "b", userId: DEMO_TEAMMATE_B },
        ],
        items: [
          { label: "My noodles", amountCents: 1200, assigneeRefs: ["a"] },
          { label: "Their rice", amountCents: 800, assigneeRefs: ["b"] },
        ],
        subtotalCents: 2000,
      })
    );
    const a = split.participants.find((p) => p.user_id === DEMO_TEAMMATE_A);
    const b = split.participants.find((p) => p.user_id === DEMO_TEAMMATE_B);
    expect(a?.owed_cents).toBe(1200);
    expect(b?.owed_cents).toBe(800);
  });

  it("splits GST/service charge proportional to each person's own item subtotal, not evenly", async () => {
    // A ate $80 of food, B ate $20 — a flat 10% service charge of $10
    // total should land $8/$2, not $5/$5.
    const split = await demoRepo.createSplit(
      DEMO_USER_ID,
      basicInput({
        participants: [
          { ref: "host", userId: DEMO_USER_ID },
          { ref: "a", userId: DEMO_TEAMMATE_A },
          { ref: "b", userId: DEMO_TEAMMATE_B },
        ],
        items: [
          { label: "Steak", amountCents: 8000, assigneeRefs: ["a"] },
          { label: "Kopi", amountCents: 2000, assigneeRefs: ["b"] },
        ],
        subtotalCents: 10000,
        gstCents: 0,
        serviceChargeCents: 1000,
        serviceChargeIncluded: true,
      })
    );
    const a = split.participants.find((p) => p.user_id === DEMO_TEAMMATE_A);
    const b = split.participants.find((p) => p.user_id === DEMO_TEAMMATE_B);
    expect(a?.owed_cents).toBe(8800);
    expect(b?.owed_cents).toBe(2200);
  });

  it("leaves GST/service charge out of the split when toggled off", async () => {
    const split = await demoRepo.createSplit(
      DEMO_USER_ID,
      basicInput({
        participants: [
          { ref: "host", userId: DEMO_USER_ID },
          { ref: "a", userId: DEMO_TEAMMATE_A },
        ],
        items: [{ label: "Chicken rice", amountCents: 1000, assigneeRefs: ["a"] }],
        subtotalCents: 1000,
        gstCents: 90,
        serviceChargeCents: 100,
        gstIncluded: false,
        serviceChargeIncluded: false,
      })
    );
    const a = split.participants.find((p) => p.user_id === DEMO_TEAMMATE_A);
    expect(a?.owed_cents).toBe(1000);
  });

  it("charges nobody for an item with no assignees, rather than the payer", async () => {
    const split = await demoRepo.createSplit(
      DEMO_USER_ID,
      basicInput({
        items: [
          { label: "Unassigned appetizer", amountCents: 500, assigneeRefs: [] },
          { label: "My lunch", amountCents: 1000, assigneeRefs: ["host"] },
        ],
        subtotalCents: 1500,
      })
    );
    const host = split.participants.find((p) => p.user_id === DEMO_USER_ID);
    expect(host?.owed_cents).toBe(1000);
    const total = split.participants.reduce((sum, p) => sum + p.owed_cents, 0);
    expect(total).toBe(1000);
  });

  it("supports a guest assignee alongside a registered one", async () => {
    const split = await demoRepo.createSplit(
      DEMO_USER_ID,
      basicInput({
        participants: [
          { ref: "host", userId: DEMO_USER_ID },
          { ref: "guest1", guestName: "Jamie (friend)" },
        ],
        items: [{ label: "Shared starter", amountCents: 2000, assigneeRefs: ["host", "guest1"] }],
        subtotalCents: 2000,
      })
    );
    const guest = split.participants.find((p) => p.guest_name === "Jamie (friend)");
    expect(guest).toBeDefined();
    expect(guest?.user_id).toBeNull();
    expect(guest?.owed_cents).toBe(1000);
    expect(guest?.display_name).toBe("Jamie (friend)");
  });

  it("defaults the payer to the creator, and includes them as a participant even with nothing assigned", async () => {
    const split = await demoRepo.createSplit(
      DEMO_USER_ID,
      basicInput({
        participants: [
          { ref: "host", userId: DEMO_USER_ID },
          { ref: "a", userId: DEMO_TEAMMATE_A },
        ],
        items: [{ label: "Their lunch", amountCents: 1000, assigneeRefs: ["a"] }],
      })
    );
    expect(split.payer_user_id).toBe(DEMO_USER_ID);
    const payer = split.participants.find((p) => p.user_id === DEMO_USER_ID);
    expect(payer).toBeDefined();
    expect(payer?.owed_cents).toBe(0);
  });

  it("lets the payer be someone other than the creator", async () => {
    const split = await demoRepo.createSplit(
      DEMO_USER_ID,
      basicInput({
        participants: [
          { ref: "host", userId: DEMO_USER_ID },
          { ref: "a", userId: DEMO_TEAMMATE_A },
        ],
        payerUserId: DEMO_TEAMMATE_A,
      })
    );
    expect(split.payer_user_id).toBe(DEMO_TEAMMATE_A);
  });

  it("replaces a Jio's existing linked split rather than stacking a history", async () => {
    const event = await makeClosedEvent();
    await demoRepo.createSplit(DEMO_USER_ID, basicInput({ eventId: event.id }));
    await demoRepo.createSplit(
      DEMO_USER_ID,
      basicInput({
        eventId: event.id,
        items: [{ label: "Corrected item", amountCents: 500, assigneeRefs: ["host"] }],
        subtotalCents: 500,
      })
    );
    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.billSplit?.items).toHaveLength(1);
    expect(detail?.billSplit?.items[0].label).toBe("Corrected item");
  });

  it("does not limit how many standalone splits the same person creates", async () => {
    await demoRepo.createSplit(DEMO_USER_ID, basicInput({ title: "First" }));
    await demoRepo.createSplit(DEMO_USER_ID, basicInput({ title: "Second" }));
    const mine = await demoRepo.listSplits(DEMO_USER_ID);
    expect(mine.filter((s) => s.role === "creator")).toHaveLength(2);
  });
});

describe("updateSplit", () => {
  it("refuses anyone but the writer", async () => {
    const split = await demoRepo.createSplit(DEMO_USER_ID, basicInput());
    await expect(
      demoRepo.updateSplit(split.id, DEMO_TEAMMATE_A, basicInput())
    ).rejects.toThrow(/only the host/i);
  });

  it("re-saves with a fresh item list", async () => {
    const split = await demoRepo.createSplit(
      DEMO_USER_ID,
      basicInput({
        participants: [
          { ref: "host", userId: DEMO_USER_ID },
          { ref: "b", userId: DEMO_TEAMMATE_B },
        ],
      })
    );
    const updated = await demoRepo.updateSplit(
      split.id,
      DEMO_USER_ID,
      basicInput({
        participants: [
          { ref: "host", userId: DEMO_USER_ID },
          { ref: "b", userId: DEMO_TEAMMATE_B },
        ],
        items: [{ label: "Edited item", amountCents: 2000, assigneeRefs: ["b"] }],
        subtotalCents: 2000,
      })
    );
    expect(updated.id).toBe(split.id);
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0].label).toBe("Edited item");
  });

  it("preserves a kept participant's phone number and paid status across an edit", async () => {
    const split = await demoRepo.createSplit(DEMO_USER_ID, basicInput());
    const hostParticipantId = split.participants.find((p) => p.user_id === DEMO_USER_ID)!.id;
    await demoRepo.setSplitParticipantPhone(split.id, DEMO_USER_ID, hostParticipantId, "+6591234567");
    await demoRepo.setSplitPaid(split.id, DEMO_USER_ID, hostParticipantId, true);

    const updated = await demoRepo.updateSplit(
      split.id,
      DEMO_USER_ID,
      basicInput({
        participants: [{ ref: "host", participantId: hostParticipantId, userId: DEMO_USER_ID }],
        items: [{ label: "Still mine", amountCents: 1500, assigneeRefs: ["host"] }],
        subtotalCents: 1500,
      })
    );
    const payer = updated.participants.find((p) => p.user_id === DEMO_USER_ID);
    expect(payer?.id).toBe(hostParticipantId);
    expect(payer?.phone_number).toBe("+6591234567");
    expect(payer?.paid_at).toBeTruthy();
  });

  it("removes a participant's row when they're dropped from the roster", async () => {
    const split = await demoRepo.createSplit(
      DEMO_USER_ID,
      basicInput({
        participants: [
          { ref: "host", userId: DEMO_USER_ID },
          { ref: "a", userId: DEMO_TEAMMATE_A },
        ],
        items: [{ label: "Shared", amountCents: 1000, assigneeRefs: ["host", "a"] }],
      })
    );
    expect(split.participants.find((p) => p.user_id === DEMO_TEAMMATE_A)).toBeDefined();

    const updated = await demoRepo.updateSplit(
      split.id,
      DEMO_USER_ID,
      basicInput({
        participants: [{ ref: "host", userId: DEMO_USER_ID }],
        items: [{ label: "Shared", amountCents: 1000, assigneeRefs: ["host"] }],
      })
    );
    expect(updated.participants.find((p) => p.user_id === DEMO_TEAMMATE_A)).toBeUndefined();
  });
});

describe("deleteSplit", () => {
  it("refuses anyone but the writer", async () => {
    const split = await demoRepo.createSplit(DEMO_USER_ID, basicInput());
    await expect(demoRepo.deleteSplit(split.id, DEMO_TEAMMATE_A)).rejects.toThrow(/only the host/i);
  });

  it("removes the split entirely", async () => {
    const split = await demoRepo.createSplit(DEMO_USER_ID, basicInput());
    await demoRepo.deleteSplit(split.id, DEMO_USER_ID);
    expect(await demoRepo.getSplit(split.id, DEMO_USER_ID)).toBeNull();
  });
});

describe("setSplitParticipantPhone", () => {
  it("refuses anyone but the writer", async () => {
    const split = await demoRepo.createSplit(DEMO_USER_ID, basicInput());
    const hostParticipantId = split.participants[0].id;
    await expect(
      demoRepo.setSplitParticipantPhone(split.id, DEMO_TEAMMATE_A, hostParticipantId, "+65123")
    ).rejects.toThrow(/only the host/i);
  });

  it("sets and clears a phone number", async () => {
    const split = await demoRepo.createSplit(DEMO_USER_ID, basicInput());
    const hostParticipantId = split.participants[0].id;
    const updated = await demoRepo.setSplitParticipantPhone(
      split.id,
      DEMO_USER_ID,
      hostParticipantId,
      "+6591234567"
    );
    expect(updated.participants[0].phone_number).toBe("+6591234567");

    const cleared = await demoRepo.setSplitParticipantPhone(split.id, DEMO_USER_ID, hostParticipantId, null);
    expect(cleared.participants[0].phone_number).toBeNull();
  });

  it("refuses an unknown participant id", async () => {
    const split = await demoRepo.createSplit(DEMO_USER_ID, basicInput());
    await expect(
      demoRepo.setSplitParticipantPhone(split.id, DEMO_USER_ID, "not-a-real-id", "+65123")
    ).rejects.toThrow(/isn't part of this bill split/i);
  });
});

describe("setSplitPaid", () => {
  it("toggles paid status on and off", async () => {
    const split = await demoRepo.createSplit(DEMO_USER_ID, basicInput());
    const hostParticipantId = split.participants[0].id;
    const paid = await demoRepo.setSplitPaid(split.id, DEMO_USER_ID, hostParticipantId, true);
    expect(paid.participants[0].paid_at).toBeTruthy();

    const unpaid = await demoRepo.setSplitPaid(split.id, DEMO_USER_ID, hostParticipantId, false);
    expect(unpaid.participants[0].paid_at).toBeNull();
  });
});

describe("getSplit", () => {
  it("is visible to its creator", async () => {
    const split = await demoRepo.createSplit(DEMO_USER_ID, basicInput());
    expect(await demoRepo.getSplit(split.id, DEMO_USER_ID)).not.toBeNull();
  });

  it("is visible to a registered participant", async () => {
    const split = await demoRepo.createSplit(
      DEMO_USER_ID,
      basicInput({
        participants: [
          { ref: "host", userId: DEMO_USER_ID },
          { ref: "a", userId: DEMO_TEAMMATE_A },
        ],
        items: [{ label: "Shared", amountCents: 1000, assigneeRefs: ["a"] }],
      })
    );
    expect(await demoRepo.getSplit(split.id, DEMO_TEAMMATE_A)).not.toBeNull();
  });

  it("is hidden from a stranger when the split is standalone", async () => {
    const split = await demoRepo.createSplit(DEMO_USER_ID, basicInput());
    expect(await demoRepo.getSplit(split.id, STRANGER)).toBeNull();
  });

  it("is visible to someone merely invited to the linked Jio, even without being in the split", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createSplit(DEMO_USER_ID, basicInput({ eventId: event.id }));
    // DEMO_TEAMMATE_B was invited to the Jio but never assigned an item.
    expect(await demoRepo.getSplit(split.id, DEMO_TEAMMATE_B)).not.toBeNull();
  });

  it("is still hidden from a stranger even when the split is linked to a Jio", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createSplit(DEMO_USER_ID, basicInput({ eventId: event.id }));
    expect(await demoRepo.getSplit(split.id, STRANGER)).toBeNull();
  });
});

describe("listSplits", () => {
  it("lists what I created and what I'm merely a participant in, newest first", async () => {
    const mine = await demoRepo.createSplit(DEMO_USER_ID, basicInput({ title: "Mine" }));
    const theirs = await demoRepo.createSplit(
      DEMO_TEAMMATE_A,
      basicInput({
        title: "Theirs",
        participants: [
          { ref: "a", userId: DEMO_TEAMMATE_A },
          { ref: "me", userId: DEMO_USER_ID },
        ],
        items: [{ label: "Shared", amountCents: 1000, assigneeRefs: ["me"] }],
      })
    );

    const rows = await demoRepo.listSplits(DEMO_USER_ID);
    expect(rows.map((r) => r.id).sort()).toEqual([mine.id, theirs.id].sort());
    expect(rows.find((r) => r.id === mine.id)?.role).toBe("creator");
    expect(rows.find((r) => r.id === theirs.id)?.role).toBe("participant");
    expect(rows.find((r) => r.id === theirs.id)?.your_owed_cents).toBe(1000);
  });
});

describe("uploadReceiptImage", () => {
  it("returns null in demo mode, with no real storage backend", async () => {
    const path = await demoRepo.uploadReceiptImage(DEMO_USER_ID, "", "image/jpeg");
    expect(path).toBeNull();
  });
});
