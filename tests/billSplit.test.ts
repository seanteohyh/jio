import { beforeEach, describe, expect, it } from "vitest";
import { demoRepo, resetDemoStore } from "@/lib/data/demoRepo";
import { DEFAULT_OFFICE, DEMO_USER_ID } from "@/lib/constants";
import { DEMO_TEAMMATE_A, DEMO_TEAMMATE_B } from "@/lib/data/demoData";
import type { BillSplitInput } from "@/lib/data";

/**
 * Receipt bill-splitting — 099_bill_splits.sql. A real report ("didn't
 * see the invite") led into an audit that surfaced none of this; this is
 * a brand-new feature, asked for directly. Covers the split arithmetic
 * (even split per item, proportional GST/service charge), the host-only/
 * closed-only gating every other Jio correction already uses, and that
 * an item with nobody assigned contributes to nobody's total rather than
 * being silently dropped or charged to the payer.
 */

const TOMORROW = new Date(Date.now() + 86400000).toISOString();

beforeEach(() => {
  resetDemoStore();
});

async function makeClosedEvent() {
  const event = await demoRepo.createEvent(
    DEMO_USER_ID,
    "Test lunch",
    TOMORROW,
    DEFAULT_OFFICE.id,
    ["demo-place-01"],
    null,
    [DEMO_TEAMMATE_A, DEMO_TEAMMATE_B]
  );
  return demoRepo.closeEvent(event.id, DEMO_USER_ID, "demo-place-01");
}

function basicInput(overrides: Partial<BillSplitInput> = {}): BillSplitInput {
  return {
    items: [{ label: "Chicken rice", amountCents: 1000, assigneeIds: [DEMO_USER_ID] }],
    subtotalCents: 1000,
    gstCents: 0,
    serviceChargeCents: 0,
    gstIncluded: true,
    serviceChargeIncluded: true,
    ...overrides,
  };
}

describe("createBillSplit", () => {
  it("refuses anyone but the host", async () => {
    const event = await makeClosedEvent();
    await expect(
      demoRepo.createBillSplit(event.id, DEMO_TEAMMATE_A, basicInput())
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
      demoRepo.createBillSplit(event.id, DEMO_USER_ID, basicInput())
    ).rejects.toThrow(/closed/i);
  });

  it("splits an item evenly across its assignees", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(
      event.id,
      DEMO_USER_ID,
      basicInput({
        items: [
          { label: "Sharing platter", amountCents: 3000, assigneeIds: [DEMO_USER_ID, DEMO_TEAMMATE_A, DEMO_TEAMMATE_B] },
        ],
        subtotalCents: 3000,
      })
    );
    for (const p of split.participants) {
      expect(p.owed_cents).toBe(1000);
    }
  });

  it("charges an item only to whoever's actually assigned to it", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(
      event.id,
      DEMO_USER_ID,
      basicInput({
        items: [
          { label: "My noodles", amountCents: 1200, assigneeIds: [DEMO_TEAMMATE_A] },
          { label: "Their rice", amountCents: 800, assigneeIds: [DEMO_TEAMMATE_B] },
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
    const event = await makeClosedEvent();
    // A ate $80 of food, B ate $20 — a flat 10% service charge of $10
    // total should land $8/$2, not $5/$5.
    const split = await demoRepo.createBillSplit(
      event.id,
      DEMO_USER_ID,
      basicInput({
        items: [
          { label: "Steak", amountCents: 8000, assigneeIds: [DEMO_TEAMMATE_A] },
          { label: "Kopi", amountCents: 2000, assigneeIds: [DEMO_TEAMMATE_B] },
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
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(
      event.id,
      DEMO_USER_ID,
      basicInput({
        items: [{ label: "Chicken rice", amountCents: 1000, assigneeIds: [DEMO_TEAMMATE_A] }],
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
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(
      event.id,
      DEMO_USER_ID,
      basicInput({
        items: [
          { label: "Unassigned appetizer", amountCents: 500, assigneeIds: [] },
          { label: "My lunch", amountCents: 1000, assigneeIds: [DEMO_USER_ID] },
        ],
        subtotalCents: 1500,
      })
    );
    const host = split.participants.find((p) => p.user_id === DEMO_USER_ID);
    expect(host?.owed_cents).toBe(1000);
    const total = split.participants.reduce((sum, p) => sum + p.owed_cents, 0);
    expect(total).toBe(1000);
  });

  it("defaults the payer to the host, and includes them as a participant even with nothing assigned", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(
      event.id,
      DEMO_USER_ID,
      basicInput({ items: [{ label: "Their lunch", amountCents: 1000, assigneeIds: [DEMO_TEAMMATE_A] }] })
    );
    expect(split.payer_user_id).toBe(DEMO_USER_ID);
    const payer = split.participants.find((p) => p.user_id === DEMO_USER_ID);
    expect(payer).toBeDefined();
    expect(payer?.owed_cents).toBe(0);
  });

  it("lets the payer be someone other than the host", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(
      event.id,
      DEMO_USER_ID,
      basicInput({ payerUserId: DEMO_TEAMMATE_A })
    );
    expect(split.payer_user_id).toBe(DEMO_TEAMMATE_A);
  });

  it("replaces an existing split rather than stacking a history", async () => {
    const event = await makeClosedEvent();
    await demoRepo.createBillSplit(event.id, DEMO_USER_ID, basicInput());
    await demoRepo.createBillSplit(
      event.id,
      DEMO_USER_ID,
      basicInput({
        items: [{ label: "Corrected item", amountCents: 500, assigneeIds: [DEMO_USER_ID] }],
        subtotalCents: 500,
      })
    );
    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.billSplit?.items).toHaveLength(1);
    expect(detail?.billSplit?.items[0].label).toBe("Corrected item");
  });
});

describe("updateBillSplit", () => {
  it("refuses anyone but the host", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(event.id, DEMO_USER_ID, basicInput());
    await expect(
      demoRepo.updateBillSplit(split.id, DEMO_TEAMMATE_A, basicInput())
    ).rejects.toThrow(/only the host/i);
  });

  it("re-saves with a fresh item list", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(event.id, DEMO_USER_ID, basicInput());
    const updated = await demoRepo.updateBillSplit(
      split.id,
      DEMO_USER_ID,
      basicInput({
        items: [{ label: "Edited item", amountCents: 2000, assigneeIds: [DEMO_TEAMMATE_B] }],
        subtotalCents: 2000,
      })
    );
    expect(updated.id).toBe(split.id);
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0].label).toBe("Edited item");
  });

  it("preserves a participant's phone number and paid status across an edit, if they're still in it", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(event.id, DEMO_USER_ID, basicInput());
    await demoRepo.setBillSplitParticipantPhone(split.id, DEMO_USER_ID, DEMO_USER_ID, "+6591234567");
    await demoRepo.setBillSplitPaid(split.id, DEMO_USER_ID, DEMO_USER_ID, true);

    const updated = await demoRepo.updateBillSplit(
      split.id,
      DEMO_USER_ID,
      basicInput({
        items: [{ label: "Still mine", amountCents: 1500, assigneeIds: [DEMO_USER_ID] }],
        subtotalCents: 1500,
      })
    );
    const payer = updated.participants.find((p) => p.user_id === DEMO_USER_ID);
    expect(payer?.phone_number).toBe("+6591234567");
    expect(payer?.paid_at).toBeTruthy();
  });
});

describe("deleteBillSplit", () => {
  it("refuses anyone but the host", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(event.id, DEMO_USER_ID, basicInput());
    await expect(
      demoRepo.deleteBillSplit(split.id, DEMO_TEAMMATE_A)
    ).rejects.toThrow(/only the host/i);
  });

  it("removes the split entirely", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(event.id, DEMO_USER_ID, basicInput());
    await demoRepo.deleteBillSplit(split.id, DEMO_USER_ID);

    const detail = await demoRepo.getEvent(event.id);
    expect(detail?.billSplit).toBeNull();
  });
});

describe("setBillSplitParticipantPhone", () => {
  it("refuses anyone but the host", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(event.id, DEMO_USER_ID, basicInput());
    await expect(
      demoRepo.setBillSplitParticipantPhone(split.id, DEMO_TEAMMATE_A, DEMO_USER_ID, "+65123")
    ).rejects.toThrow(/only the host/i);
  });

  it("sets and clears a phone number", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(event.id, DEMO_USER_ID, basicInput());
    const updated = await demoRepo.setBillSplitParticipantPhone(
      split.id,
      DEMO_USER_ID,
      DEMO_USER_ID,
      "+6591234567"
    );
    expect(updated.participants.find((p) => p.user_id === DEMO_USER_ID)?.phone_number).toBe(
      "+6591234567"
    );

    const cleared = await demoRepo.setBillSplitParticipantPhone(
      split.id,
      DEMO_USER_ID,
      DEMO_USER_ID,
      null
    );
    expect(
      cleared.participants.find((p) => p.user_id === DEMO_USER_ID)?.phone_number
    ).toBeNull();
  });

  it("refuses someone who isn't part of this bill split", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(event.id, DEMO_USER_ID, basicInput());
    // DEMO_TEAMMATE_B is neither assigned to anything nor the payer here.
    await expect(
      demoRepo.setBillSplitParticipantPhone(split.id, DEMO_USER_ID, DEMO_TEAMMATE_B, "+65123")
    ).rejects.toThrow(/isn't part of this bill split/i);
  });
});

describe("setBillSplitPaid", () => {
  it("refuses anyone but the host", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(event.id, DEMO_USER_ID, basicInput());
    await expect(
      demoRepo.setBillSplitPaid(split.id, DEMO_TEAMMATE_A, DEMO_USER_ID, true)
    ).rejects.toThrow(/only the host/i);
  });

  it("toggles paid status on and off", async () => {
    const event = await makeClosedEvent();
    const split = await demoRepo.createBillSplit(event.id, DEMO_USER_ID, basicInput());
    const paid = await demoRepo.setBillSplitPaid(split.id, DEMO_USER_ID, DEMO_USER_ID, true);
    expect(paid.participants.find((p) => p.user_id === DEMO_USER_ID)?.paid_at).toBeTruthy();

    const unpaid = await demoRepo.setBillSplitPaid(split.id, DEMO_USER_ID, DEMO_USER_ID, false);
    expect(unpaid.participants.find((p) => p.user_id === DEMO_USER_ID)?.paid_at).toBeNull();
  });
});

describe("uploadReceiptImage", () => {
  it("returns null in demo mode, with no real storage backend", async () => {
    const event = await makeClosedEvent();
    const path = await demoRepo.uploadReceiptImage(event.id, DEMO_USER_ID, "", "image/jpeg");
    expect(path).toBeNull();
  });
});
