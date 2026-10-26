import type { BillSplitInput } from "./data";

/** The wire shape POST/PATCH on a Jio's bill split both accept. */
export interface BillSplitBody {
  payer_user_id?: string;
  receipt_image_path?: string | null;
  items?: Array<{ label?: string; amount_cents?: number; assignee_ids?: string[] }>;
  subtotal_cents?: number;
  gst_cents?: number;
  service_charge_cents?: number;
  gst_included?: boolean;
  service_charge_included?: boolean;
}

/**
 * Shared by `POST /api/events/[id]/bill-split` (create) and
 * `PATCH .../bill-split/[billSplitId]` (edit) — validates and reshapes
 * the request body into `BillSplitInput`, returning a human-readable
 * error string instead of throwing so each route can turn it into a
 * `badRequest` with no try/catch of its own.
 */
export function parseBillSplitInput(body: BillSplitBody | null): BillSplitInput | string {
  if (!body || !Array.isArray(body.items)) return "Missing the bill's items";

  const items: BillSplitInput["items"] = [];
  for (const raw of body.items) {
    const label = raw.label?.trim();
    if (!label) return "Every item needs a name";
    if (typeof raw.amount_cents !== "number" || raw.amount_cents < 0) {
      return `"${label}" needs a valid amount`;
    }
    items.push({
      label,
      amountCents: Math.round(raw.amount_cents),
      assigneeIds: Array.isArray(raw.assignee_ids) ? raw.assignee_ids : [],
    });
  }
  if (items.length === 0) return "Add at least one item";

  for (const field of ["subtotal_cents", "gst_cents", "service_charge_cents"] as const) {
    if (typeof body[field] !== "number" || body[field]! < 0) {
      return "That doesn't look like a valid amount";
    }
  }

  return {
    payerUserId: body.payer_user_id,
    receiptImagePath: body.receipt_image_path ?? null,
    items,
    subtotalCents: Math.round(body.subtotal_cents!),
    gstCents: Math.round(body.gst_cents!),
    serviceChargeCents: Math.round(body.service_charge_cents!),
    gstIncluded: body.gst_included ?? true,
    serviceChargeIncluded: body.service_charge_included ?? true,
  };
}
