import type { SplitInput, SplitItemInput, SplitParticipantInput } from "@/types";

/** The wire shape POST/PATCH on a split both accept. */
export interface SplitBody {
  title?: string;
  /** Only read by `POST` (create) — an update can never re-link or
   *  unlink a split, see `writeSplit`'s own doc comment. */
  event_id?: string | null;
  payer_user_id?: string;
  receipt_image_path?: string | null;
  participants?: Array<{
    ref?: string;
    participant_id?: string;
    user_id?: string;
    guest_name?: string;
    phone_number?: string | null;
  }>;
  items?: Array<{
    label?: string;
    amount_cents?: number;
    assignee_refs?: string[];
    discount_amount_cents?: number;
    discount_percent?: number;
    discount_scope?: string;
  }>;
  subtotal_cents?: number;
  gst_cents?: number;
  service_charge_cents?: number;
  gst_included?: boolean;
  service_charge_included?: boolean;
  discount_percent?: number;
}

/**
 * Shared by `POST /api/splits` (create) and `PATCH /api/splits/[id]`
 * (edit) — validates and reshapes the request body into `SplitInput`,
 * returning a human-readable error string instead of throwing so each
 * route can turn it into a `badRequest` with no try/catch of its own.
 */
export function parseSplitInput(body: SplitBody | null): SplitInput | string {
  if (!body || !Array.isArray(body.items)) return "Missing the bill's items";
  if (!Array.isArray(body.participants)) return "Missing who's in this split";

  const seenRefs = new Set<string>();
  const participants: SplitParticipantInput[] = [];
  for (const raw of body.participants) {
    const ref = raw.ref?.trim();
    if (!ref) return "Every person needs a reference";
    if (seenRefs.has(ref)) return "Duplicate person in this split";
    seenRefs.add(ref);

    const participantId = raw.participant_id?.trim() || undefined;
    const userId = raw.user_id?.trim() || undefined;
    const guestName = raw.guest_name?.trim() || undefined;
    if (!participantId && !userId && !guestName) {
      return "Every person needs either an account or a name";
    }
    participants.push({
      ref,
      participantId,
      userId,
      guestName,
      phoneNumber: raw.phone_number === undefined ? undefined : raw.phone_number,
    });
  }

  const items: SplitItemInput[] = [];
  for (const raw of body.items) {
    const label = raw.label?.trim();
    if (!label) return "Every item needs a name";
    if (typeof raw.amount_cents !== "number" || raw.amount_cents < 0) {
      return `"${label}" needs a valid amount`;
    }
    const assigneeRefs = Array.isArray(raw.assignee_refs) ? raw.assignee_refs : [];
    for (const ref of assigneeRefs) {
      if (!seenRefs.has(ref)) return "An item is assigned to someone not in this split";
    }
    const discountAmountCents = raw.discount_amount_cents ?? 0;
    const discountPercent = raw.discount_percent ?? 0;
    if (
      typeof discountAmountCents !== "number" ||
      discountAmountCents < 0 ||
      typeof discountPercent !== "number" ||
      discountPercent < 0 ||
      discountPercent > 100
    ) {
      return `"${label}" has an invalid discount`;
    }
    const discountScope = raw.discount_scope === "shared" ? "shared" : "item";
    items.push({
      label,
      amountCents: Math.round(raw.amount_cents),
      assigneeRefs,
      discountAmountCents: Math.round(discountAmountCents),
      discountPercent,
      discountScope,
    });
  }
  if (items.length === 0) return "Add at least one item";

  for (const field of ["subtotal_cents", "gst_cents", "service_charge_cents"] as const) {
    if (typeof body[field] !== "number" || body[field]! < 0) {
      return "That doesn't look like a valid amount";
    }
  }
  const discountPercent = body.discount_percent ?? 0;
  if (typeof discountPercent !== "number" || discountPercent < 0 || discountPercent > 100) {
    return "That doesn't look like a valid discount";
  }

  return {
    title: body.title?.trim() ?? "",
    eventId: body.event_id ?? null,
    payerUserId: body.payer_user_id,
    receiptImagePath: body.receipt_image_path ?? null,
    participants,
    items,
    subtotalCents: Math.round(body.subtotal_cents!),
    gstCents: Math.round(body.gst_cents!),
    serviceChargeCents: Math.round(body.service_charge_cents!),
    gstIncluded: body.gst_included ?? true,
    serviceChargeIncluded: body.service_charge_included ?? true,
    discountPercent,
  };
}
