"use client";

import { useRef, useState } from "react";
import { Avatar, Button, Card, SectionHeading, inputClass } from "@/components/ui";
import { AlertIcon } from "@/components/icons";
import { mutateJson } from "@/lib/fetcher";
import { formatCents } from "@/lib/expenses";
import { buildWhatsAppPaymentLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import type { EventDetail } from "@/types";

/**
 * Receipt bill-splitting (099_bill_splits.sql) — host-only, closed-only.
 * Photo → OCR-prefilled items, or "enter by hand," both landing on the
 * same editable review-and-assign screen; nothing is saved to the server
 * until "Save the split," so OCR only ever has to be "good enough to
 * start from," never trusted outright.
 */

interface DraftItem {
  key: string;
  label: string;
  amountCents: number;
  assigneeIds: string[];
}

interface Draft {
  receiptImagePath: string | null;
  payerUserId: string;
  items: DraftItem[];
  subtotalCents: number;
  gstCents: number;
  serviceChargeCents: number;
  gstIncluded: boolean;
  serviceChargeIncluded: boolean;
}

interface Person {
  id: string;
  name: string;
}

/** Who's assignable — confirmed-going RSVPs first (the people who
 *  actually said they'd be there), falling back to every resolved
 *  participant if nobody RSVP'd at all so this still works for a Jio
 *  that never used RSVP. The host is always included, even if filtered
 *  out above — whoever's splitting the bill is almost certainly eating
 *  too. */
function resolveAssignablePeople(event: EventDetail): Person[] {
  const going = event.rsvps.filter((r) => r.response === "yes");
  const pool: Person[] =
    going.length > 0
      ? going.map((r) => ({ id: r.user_id, name: r.display_name ?? "Teammate" }))
      : [
          { id: event.host_id, name: event.host_name ?? "Host" },
          ...event.invitees.map((i) => ({
            id: i.user_id,
            name: i.display_name ?? "Teammate",
          })),
        ];

  const byId = new Map(pool.map((p) => [p.id, p]));
  if (!byId.has(event.host_id)) {
    byId.set(event.host_id, { id: event.host_id, name: event.host_name ?? "Host" });
  }
  return Array.from(byId.values());
}

function emptyDraft(payerUserId: string): Draft {
  return {
    receiptImagePath: null,
    payerUserId,
    items: [],
    subtotalCents: 0,
    gstCents: 0,
    serviceChargeCents: 0,
    gstIncluded: false,
    serviceChargeIncluded: false,
  };
}

function draftFromSplit(split: NonNullable<EventDetail["billSplit"]>): Draft {
  return {
    receiptImagePath: split.receipt_image_path ?? null,
    payerUserId: split.payer_user_id,
    items: split.items.map((item) => ({
      key: item.id,
      label: item.label,
      amountCents: item.amount_cents,
      assigneeIds: item.assignee_ids,
    })),
    subtotalCents: split.subtotal_cents,
    gstCents: split.gst_cents,
    serviceChargeCents: split.service_charge_cents,
    gstIncluded: split.gst_included,
    serviceChargeIncluded: split.service_charge_included,
  };
}

/** Resized client-side before it ever reaches the server — keeps both
 *  Storage usage and the vision API payload small, since a phone photo
 *  straight off the camera is routinely 10x larger than a receipt photo
 *  actually needs to be for either OCR or a human to read back later. */
async function downscaleImage(file: File): Promise<{ base64: string; mediaType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = dataUrl;
  });

  const MAX_DIMENSION = 1600;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process that image");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const resized = canvas.toDataURL("image/jpeg", 0.82);
  return { base64: resized.split(",")[1] ?? "", mediaType: "image/jpeg" };
}

interface ScanResponse {
  receiptImagePath: string | null;
  ok: boolean;
  receipt: {
    items: { label: string; amount_cents: number }[];
    subtotal_cents: number;
    gst_cents: number;
    service_charge_cents: number;
  } | null;
  error: string | null;
}

export default function BillSplitCard({
  event,
  viewerId,
  onChanged,
}: {
  event: EventDetail;
  viewerId: string;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "scanning" | "reviewing">("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const people = resolveAssignablePeople(event);
  const nameFor = (userId: string) =>
    people.find((p) => p.id === userId)?.name ?? "Teammate";

  const handleFile = async (file: File) => {
    setError(null);
    setScanNote(null);
    setMode("scanning");
    try {
      const { base64, mediaType } = await downscaleImage(file);
      const result = await mutateJson<ScanResponse>(
        `/api/events/${event.id}/bill-split/scan`,
        "POST",
        { imageBase64: base64, mediaType }
      );

      setDraft({
        receiptImagePath: result.receiptImagePath,
        payerUserId: viewerId,
        items: (result.receipt?.items ?? []).map((item, i) => ({
          key: `scan-${i}`,
          label: item.label,
          amountCents: item.amount_cents,
          assigneeIds: [],
        })),
        subtotalCents: result.receipt?.subtotal_cents ?? 0,
        gstCents: result.receipt?.gst_cents ?? 0,
        serviceChargeCents: result.receipt?.service_charge_cents ?? 0,
        gstIncluded: (result.receipt?.gst_cents ?? 0) > 0,
        serviceChargeIncluded: (result.receipt?.service_charge_cents ?? 0) > 0,
      });
      if (!result.ok && result.error) setScanNote(result.error);
      setMode("reviewing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not scan that receipt");
      setMode("idle");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startManual = () => {
    setError(null);
    setScanNote(null);
    setDraft(emptyDraft(viewerId));
    setMode("reviewing");
  };

  const startEdit = () => {
    if (!event.billSplit) return;
    setError(null);
    setScanNote(null);
    setDraft(draftFromSplit(event.billSplit));
    setMode("reviewing");
  };

  const cancel = () => {
    setDraft(null);
    setMode("idle");
    setError(null);
    setScanNote(null);
  };

  const addItem = () => {
    if (!draft) return;
    setDraft({
      ...draft,
      items: [
        ...draft.items,
        { key: `new-${Date.now()}-${draft.items.length}`, label: "", amountCents: 0, assigneeIds: [] },
      ],
    });
  };

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      items: draft.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    });
  };

  const removeItem = (key: string) => {
    if (!draft) return;
    setDraft({ ...draft, items: draft.items.filter((item) => item.key !== key) });
  };

  const toggleAssignee = (key: string, userId: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      items: draft.items.map((item) =>
        item.key === key
          ? {
              ...item,
              assigneeIds: item.assigneeIds.includes(userId)
                ? item.assigneeIds.filter((id) => id !== userId)
                : [...item.assigneeIds, userId],
            }
          : item
      ),
    });
  };

  // Live preview of each person's share while assigning — the server
  // recomputes this authoritatively on save; this is just immediate
  // feedback, same arithmetic as hydrateBillSplit on both repos.
  const itemsCentsByUser = new Map<string, number>();
  let totalAssignedCents = 0;
  if (draft) {
    for (const item of draft.items) {
      if (item.assigneeIds.length === 0) continue;
      totalAssignedCents += item.amountCents;
      const share = item.amountCents / item.assigneeIds.length;
      for (const userId of item.assigneeIds) {
        itemsCentsByUser.set(userId, (itemsCentsByUser.get(userId) ?? 0) + share);
      }
    }
  }
  const previewOwed = (userId: string): number => {
    if (!draft) return 0;
    const itemsCents = itemsCentsByUser.get(userId) ?? 0;
    const proportion = totalAssignedCents > 0 ? itemsCents / totalAssignedCents : 0;
    const gst = draft.gstIncluded ? draft.gstCents * proportion : 0;
    const svc = draft.serviceChargeIncluded ? draft.serviceChargeCents * proportion : 0;
    return Math.round(itemsCents + gst + svc);
  };

  const save = async () => {
    if (!draft) return;
    if (draft.items.some((item) => !item.label.trim())) {
      setError("Every item needs a name");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        payer_user_id: draft.payerUserId,
        receipt_image_path: draft.receiptImagePath,
        items: draft.items.map((item) => ({
          label: item.label.trim(),
          amount_cents: item.amountCents,
          assignee_ids: item.assigneeIds,
        })),
        subtotal_cents: draft.subtotalCents,
        gst_cents: draft.gstCents,
        service_charge_cents: draft.serviceChargeCents,
        gst_included: draft.gstIncluded,
        service_charge_included: draft.serviceChargeIncluded,
      };
      if (event.billSplit) {
        await mutateJson(
          `/api/events/${event.id}/bill-split/${event.billSplit.id}`,
          "PATCH",
          body
        );
      } else {
        await mutateJson(`/api/events/${event.id}/bill-split`, "POST", body);
      }
      setDraft(null);
      setMode("idle");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the split");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!event.billSplit) return;
    if (!window.confirm("Remove this bill split? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await mutateJson(`/api/events/${event.id}/bill-split/${event.billSplit.id}`, "DELETE");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the split");
    } finally {
      setBusy(false);
    }
  };

  const savePhone = async (userId: string) => {
    const phone = phoneDrafts[userId]?.trim();
    if (!phone || !event.billSplit) return;
    setError(null);
    try {
      await mutateJson(
        `/api/events/${event.id}/bill-split/${event.billSplit.id}/participants/${userId}`,
        "PATCH",
        { phone_number: phone }
      );
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that phone number");
    }
  };

  const togglePaid = async (userId: string, currentlyPaid: boolean) => {
    if (!event.billSplit) return;
    setError(null);
    try {
      await mutateJson(
        `/api/events/${event.id}/bill-split/${event.billSplit.id}/participants/${userId}`,
        "PATCH",
        { paid: !currentlyPaid }
      );
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update paid status");
    }
  };

  return (
    <Card className="space-y-3">
      <SectionHeading>Split the bill</SectionHeading>

      {error && (
        <p className="bg-ember-tint text-ember-tint-text flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
          <AlertIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {mode === "idle" && !event.billSplit && (
        <div className="space-y-2">
          <p className="text-stone text-xs">
            Photograph the receipt and let it scan the items, or just type
            them in yourself.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              Take or choose a photo
            </Button>
            <Button size="sm" variant="secondary" onClick={startManual}>
              Enter items by hand
            </Button>
          </div>
        </div>
      )}

      {mode === "scanning" && (
        <p className="text-stone text-xs">Reading the receipt…</p>
      )}

      {mode === "idle" && event.billSplit && (
        <div className="space-y-3">
          <p className="text-stone text-xs">
            {event.billSplit.payer_user_id === viewerId
              ? "You paid — here's who owes you."
              : `${nameFor(event.billSplit.payer_user_id)} paid — here's who owes them.`}
          </p>
          <ul className="space-y-2">
            {event.billSplit.participants
              .filter((p) => p.user_id !== event.billSplit!.payer_user_id)
              .map((p) => (
                <li
                  key={p.user_id}
                  className="border-line bg-paper space-y-1.5 rounded-lg border p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm">
                      <Avatar name={p.display_name ?? "Teammate"} id={p.user_id} size={22} />
                      {p.display_name ?? "Teammate"}
                      {p.paid_at && (
                        <span className="text-ember text-xs font-medium">· Paid</span>
                      )}
                    </span>
                    <span className="text-sm font-medium tabular-nums">
                      {formatCents(p.owed_cents)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      defaultValue={p.phone_number ?? ""}
                      onChange={(e) =>
                        setPhoneDrafts({ ...phoneDrafts, [p.user_id]: e.target.value })
                      }
                      placeholder="Phone number"
                      className={cn(inputClass, "h-8 max-w-[9rem] text-xs")}
                    />
                    <Button size="sm" variant="secondary" onClick={() => savePhone(p.user_id)}>
                      Save
                    </Button>
                    {p.phone_number && (
                      <a
                        href={buildWhatsAppPaymentLink(p.phone_number, p.owed_cents, event.title)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ember text-xs underline"
                      >
                        Send via WhatsApp
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => togglePaid(p.user_id, !!p.paid_at)}
                      className="text-stone hover:text-ink ml-auto text-xs underline"
                    >
                      {p.paid_at ? "Mark unpaid" : "Mark as paid"}
                    </button>
                  </div>
                </li>
              ))}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={startEdit}>
              Edit the split
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
              Remove
            </Button>
          </div>
        </div>
      )}

      {mode === "reviewing" && draft && (
        <div className="space-y-3">
          {scanNote && (
            <p className="text-stone bg-paper rounded-lg px-3 py-2 text-xs">{scanNote}</p>
          )}

          <ol className="space-y-2">
            {draft.items.map((item) => (
              <li key={item.key} className="border-line space-y-1.5 rounded-lg border p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    value={item.label}
                    onChange={(e) => updateItem(item.key, { label: e.target.value })}
                    placeholder="Item"
                    className={cn(inputClass, "min-w-0 flex-1")}
                  />
                  <div className="w-20 shrink-0">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={(item.amountCents / 100).toFixed(2)}
                      onChange={(e) =>
                        updateItem(item.key, {
                          amountCents: Math.round((Number(e.target.value) || 0) * 100),
                        })
                      }
                      className={cn(inputClass, "min-w-0")}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    aria-label="Remove item"
                    className="text-stone hover:text-ink shrink-0 px-1 text-sm"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {people.map((person) => {
                    const active = item.assigneeIds.includes(person.id);
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => toggleAssignee(item.key, person.id)}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs",
                          active
                            ? "bg-ember text-white"
                            : "bg-paper text-stone border-line border"
                        )}
                      >
                        {person.name}
                      </button>
                    );
                  })}
                </div>
                {item.assigneeIds.length === 0 && (
                  <p className="text-ember text-xs">Nobody's assigned to this yet.</p>
                )}
              </li>
            ))}
          </ol>

          <Button size="sm" variant="secondary" onClick={addItem}>
            + Add item
          </Button>

          <div className="border-line space-y-2 border-t pt-3">
            <div className="flex items-center gap-2">
              <label className="flex flex-1 items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={draft.gstIncluded}
                  onChange={(e) => setDraft({ ...draft, gstIncluded: e.target.checked })}
                />
                Split GST
              </label>
              <div className="w-20 shrink-0">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(draft.gstCents / 100).toFixed(2)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      gstCents: Math.round((Number(e.target.value) || 0) * 100),
                    })
                  }
                  className={cn(inputClass, "min-w-0")}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex flex-1 items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={draft.serviceChargeIncluded}
                  onChange={(e) =>
                    setDraft({ ...draft, serviceChargeIncluded: e.target.checked })
                  }
                />
                Split service charge
              </label>
              <div className="w-20 shrink-0">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(draft.serviceChargeCents / 100).toFixed(2)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      serviceChargeCents: Math.round((Number(e.target.value) || 0) * 100),
                    })
                  }
                  className={cn(inputClass, "min-w-0")}
                />
              </div>
            </div>
          </div>

          <div className="border-line space-y-1.5 border-t pt-3">
            <p className="text-stone text-xs font-medium tracking-wide uppercase">
              Running total
            </p>
            {people.map((person) => (
              <div key={person.id} className="flex items-center justify-between text-sm">
                <span>{person.name}</span>
                <span className="tabular-nums">{formatCents(previewOwed(person.id))}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>
              Save the split
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
