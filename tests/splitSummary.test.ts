import { describe, expect, it } from "vitest";
import { buildSplitSummaryText } from "@/lib/splitSummary";
import type { BillSplit } from "@/types";

function makeSplit(overrides: Partial<BillSplit> = {}): BillSplit {
  return {
    id: "split-1",
    created_by: "payer-1",
    title: "Friday lunch",
    payer_user_id: "payer-1",
    subtotal_cents: 0,
    gst_cents: 0,
    service_charge_cents: 0,
    gst_included: true,
    service_charge_included: true,
    discount_percent: 0,
    status: "finalized",
    created_at: new Date().toISOString(),
    items: [],
    participants: [],
    ...overrides,
  };
}

describe("buildSplitSummaryText", () => {
  it("includes the split title and each non-payer's owed amount", () => {
    const text = buildSplitSummaryText(
      makeSplit({
        participants: [
          { id: "p1", user_id: "payer-1", display_name: "Sean", owed_cents: 0 },
          { id: "p2", user_id: "u2", display_name: "Alex", owed_cents: 1250 },
        ],
      })
    );
    expect(text).toContain("Friday lunch");
    expect(text).toContain("Alex: $12.50");
    expect(text).not.toContain("Sean: ");
  });

  it("marks a settled participant as paid", () => {
    const text = buildSplitSummaryText(
      makeSplit({
        participants: [
          { id: "p1", user_id: "payer-1", display_name: "Sean", owed_cents: 0 },
          {
            id: "p2",
            user_id: "u2",
            display_name: "Alex",
            owed_cents: 1250,
            paid_at: new Date().toISOString(),
          },
        ],
      })
    );
    expect(text).toContain("Alex: $12.50 (paid)");
  });

  it("includes the payer's own phone number when set", () => {
    const text = buildSplitSummaryText(
      makeSplit({
        participants: [
          { id: "p1", user_id: "payer-1", display_name: "Sean", owed_cents: 0, phone_number: "91234567" },
        ],
      })
    );
    expect(text).toContain("Pay Sean — 91234567");
  });

  it("falls back to just the payer's name with no phone number set", () => {
    const text = buildSplitSummaryText(
      makeSplit({
        participants: [{ id: "p1", user_id: "payer-1", display_name: "Sean", owed_cents: 0 }],
      })
    );
    expect(text).toContain("Pay Sean");
    expect(text).not.toContain("—");
  });

  it("works for a guest participant the same as a registered one", () => {
    const text = buildSplitSummaryText(
      makeSplit({
        participants: [
          { id: "p1", user_id: "payer-1", display_name: "Sean", owed_cents: 0 },
          { id: "p2", guest_name: "Riley", display_name: "Riley", owed_cents: 500 },
        ],
      })
    );
    expect(text).toContain("Riley: $5.00");
  });
});
