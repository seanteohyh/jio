"use client";

import { useState } from "react";
import InvitePicker, { type InviteSelection } from "@/components/InvitePicker";
import { Avatar, Button, Card, Field, inputClass } from "@/components/ui";
import { AlertIcon } from "@/components/icons";
import { mutateJson, fetcher } from "@/lib/fetcher";
import { formatCents } from "@/lib/expenses";
import { cn } from "@/lib/utils";
import type { BillSplit, KakiDetail, TeamUser } from "@/types";

/**
 * The review-and-assign screen — shared by starting a brand-new split
 * (from a scan or manual entry) and re-opening a saved one to correct
 * it. Nothing here is tied to a Jio: the "who's splitting this" roster
 * is built up by the host (search people/Kaki groups, or add a guest by
 * name), not derived from one fixed source. When started from a linked
 * Jio, the caller just seeds `initialRoster` from that Jio's own
 * participants — still fully editable afterward, never a ceiling.
 */

export interface RosterPerson {
  /** Stable within this one edit session — wires a roster entry to an
   *  item's `assigneeRefs`. For an existing participant (editing a saved
   *  split) this is that participant's real id, so items continue to
   *  reference the same row across saves. */
  ref: string;
  /** Set only when this roster entry maps to an EXISTING
   *  `bill_split_participants` row. */
  participantId?: string;
  userId?: string;
  guestName?: string;
  name: string;
  phoneNumber?: string | null;
}

interface DraftItem {
  key: string;
  label: string;
  amountCents: number;
  assigneeRefs: string[];
}

function newRef(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function SplitEditor({
  viewerId,
  splitId,
  eventId,
  initialTitle,
  initialPayerUserId,
  initialRoster,
  initialItems,
  initialReceiptImagePath,
  initialReceiptImageUrl,
  initialGstCents,
  initialGstIncluded,
  initialServiceChargeCents,
  initialServiceChargeIncluded,
  initialSubtotalCents,
  onSaved,
  onCancel,
}: {
  viewerId: string;
  /** Present when editing an existing split — saves PATCH instead of
   *  POST. */
  splitId?: string;
  /** Only ever sent on the very first save (`POST`) — see `writeSplit`'s
   *  own doc comment on why an edit can never re-link or unlink. */
  eventId?: string | null;
  initialTitle: string;
  initialPayerUserId: string;
  initialRoster: RosterPerson[];
  initialItems?: DraftItem[];
  initialReceiptImagePath?: string | null;
  initialReceiptImageUrl?: string | null;
  initialGstCents?: number;
  initialGstIncluded?: boolean;
  initialServiceChargeCents?: number;
  initialServiceChargeIncluded?: boolean;
  initialSubtotalCents?: number;
  onSaved: (split: BillSplit) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [payerUserId, setPayerUserId] = useState(initialPayerUserId);
  const [roster, setRoster] = useState<RosterPerson[]>(initialRoster);
  const [items, setItems] = useState<DraftItem[]>(initialItems ?? []);
  const [gstCents, setGstCents] = useState(initialGstCents ?? 0);
  const [gstIncluded, setGstIncluded] = useState(initialGstIncluded ?? false);
  const [serviceChargeCents, setServiceChargeCents] = useState(
    initialServiceChargeCents ?? 0
  );
  const [serviceChargeIncluded, setServiceChargeIncluded] = useState(
    initialServiceChargeIncluded ?? false
  );
  const [subtotalCents] = useState(initialSubtotalCents ?? 0);
  const [receiptImagePath] = useState(initialReceiptImagePath ?? null);

  const [addingPeople, setAddingPeople] = useState(false);
  const [pickerValue, setPickerValue] = useState<InviteSelection>({
    userIds: [],
    kakiIds: [],
  });
  const [resolvingPicker, setResolvingPicker] = useState(false);

  const [addingGuest, setAddingGuest] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addItem = () => {
    setItems([...items, { key: newRef("item"), label: "", amountCents: 0, assigneeRefs: [] }]);
  };
  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };
  const removeItem = (key: string) => {
    setItems(items.filter((item) => item.key !== key));
  };
  const toggleAssignee = (key: string, ref: string) => {
    setItems(
      items.map((item) =>
        item.key === key
          ? {
              ...item,
              assigneeRefs: item.assigneeRefs.includes(ref)
                ? item.assigneeRefs.filter((r) => r !== ref)
                : [...item.assigneeRefs, ref],
            }
          : item
      )
    );
  };

  const removePerson = (ref: string) => {
    setRoster(roster.filter((p) => p.ref !== ref));
    setItems(items.map((item) => ({ ...item, assigneeRefs: item.assigneeRefs.filter((r) => r !== ref) })));
  };

  const confirmAddFromPicker = async () => {
    setResolvingPicker(true);
    setError(null);
    try {
      const existingUserIds = new Set(roster.map((p) => p.userId).filter(Boolean));
      const userIdsToAdd = new Set<string>(
        pickerValue.userIds.filter((id) => !existingUserIds.has(id))
      );

      // Kaki groups expand to their members client-side (KakiDetail
      // already carries each member's display_name — no extra lookup
      // needed for those).
      const kakiMembers: { user_id: string; display_name?: string }[] = [];
      for (const kakiId of pickerValue.kakiIds) {
        const detail = await fetcher<{ kaki: KakiDetail }>(`/api/kakis/${kakiId}`);
        for (const member of detail.kaki.members) {
          if (!existingUserIds.has(member.user_id)) {
            kakiMembers.push(member);
            userIdsToAdd.add(member.user_id);
          }
        }
      }

      const nameById = new Map<string, string>();
      for (const m of kakiMembers) {
        if (m.display_name) nameById.set(m.user_id, m.display_name);
      }
      const unresolvedIds = Array.from(userIdsToAdd).filter((id) => !nameById.has(id));
      if (unresolvedIds.length > 0) {
        const params = new URLSearchParams();
        for (const id of unresolvedIds) params.append("include_id", id);
        const resolved = await fetcher<{ users: TeamUser[] }>(`/api/users?${params.toString()}`);
        for (const u of resolved.users) nameById.set(u.user_id, u.display_name);
      }

      const additions: RosterPerson[] = Array.from(userIdsToAdd).map((userId) => ({
        ref: `user-${userId}`,
        userId,
        name: nameById.get(userId) ?? "Teammate",
      }));
      setRoster([...roster, ...additions]);
      setPickerValue({ userIds: [], kakiIds: [] });
      setAddingPeople(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add those people");
    } finally {
      setResolvingPicker(false);
    }
  };

  const confirmAddGuest = () => {
    const name = guestName.trim();
    if (!name) return;
    setRoster([
      ...roster,
      {
        ref: newRef("guest"),
        guestName: name,
        name,
        phoneNumber: guestPhone.trim() || null,
      },
    ]);
    setGuestName("");
    setGuestPhone("");
    setAddingGuest(false);
  };

  // Live preview of each person's share while assigning — the server
  // recomputes this authoritatively on save; this is just immediate
  // feedback, same arithmetic as hydrateSplit on both repos.
  const itemsCentsByRef = new Map<string, number>();
  let totalAssignedCents = 0;
  for (const item of items) {
    if (item.assigneeRefs.length === 0) continue;
    totalAssignedCents += item.amountCents;
    const share = item.amountCents / item.assigneeRefs.length;
    for (const ref of item.assigneeRefs) {
      itemsCentsByRef.set(ref, (itemsCentsByRef.get(ref) ?? 0) + share);
    }
  }
  const previewOwed = (ref: string): number => {
    const itemsCents = itemsCentsByRef.get(ref) ?? 0;
    const proportion = totalAssignedCents > 0 ? itemsCents / totalAssignedCents : 0;
    const gst = gstIncluded ? gstCents * proportion : 0;
    const svc = serviceChargeIncluded ? serviceChargeCents * proportion : 0;
    return Math.round(itemsCents + gst + svc);
  };

  const itemsSumCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  const subtotalMismatch =
    subtotalCents > 0 && Math.abs(subtotalCents - itemsSumCents) > 1;

  const save = async () => {
    if (items.some((item) => !item.label.trim())) {
      setError("Every item needs a name");
      return;
    }
    if (roster.length === 0) {
      setError("Add at least one person to this split");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        title: title.trim() || "Bill split",
        event_id: eventId ?? null,
        payer_user_id: payerUserId,
        receipt_image_path: receiptImagePath,
        participants: roster.map((p) => ({
          ref: p.ref,
          participant_id: p.participantId,
          user_id: p.userId,
          guest_name: p.guestName,
          phone_number: p.phoneNumber ?? undefined,
        })),
        items: items.map((item) => ({
          label: item.label.trim(),
          amount_cents: item.amountCents,
          assignee_refs: item.assigneeRefs,
        })),
        subtotal_cents: subtotalCents,
        gst_cents: gstCents,
        service_charge_cents: serviceChargeCents,
        gst_included: gstIncluded,
        service_charge_included: serviceChargeIncluded,
      };
      const result = splitId
        ? await mutateJson<{ split: BillSplit }>(`/api/splits/${splitId}`, "PATCH", body)
        : await mutateJson<{ split: BillSplit }>("/api/splits", "POST", body);
      onSaved(result.split);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the split");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (items.length > 0 && !window.confirm("Discard your changes to this split?")) return;
    onCancel?.();
  };

  const registeredRoster = roster.filter((p) => p.userId);

  return (
    <Card className="space-y-4">
      {error && (
        <p className="bg-ember-tint text-ember-tint-text flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
          <AlertIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {initialReceiptImageUrl && (
        <img
          src={initialReceiptImageUrl}
          alt="The scanned receipt"
          className="border-line max-h-64 w-full rounded-lg border object-contain"
        />
      )}

      <Field label="What's this for?">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Dinner at Kok Sen"
          className={inputClass}
        />
      </Field>

      <div className="space-y-2">
        <p className="text-stone text-xs font-medium tracking-wide uppercase">
          Who&apos;s splitting this
        </p>
        <div className="flex flex-wrap gap-1.5">
          {roster.map((p) => (
            <span
              key={p.ref}
              className="bg-paper border-line flex items-center gap-1.5 rounded-full border py-1 pr-1 pl-2.5 text-xs"
            >
              {p.name}
              {p.userId === payerUserId && <span className="text-stone"> · paying</span>}
              {p.userId !== payerUserId && (
                <button
                  type="button"
                  onClick={() => removePerson(p.ref)}
                  aria-label={`Remove ${p.name}`}
                  className="text-stone hover:text-ink px-1"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          <Button size="sm" variant="secondary" onClick={() => setAddingPeople((v) => !v)}>
            + Add people
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAddingGuest((v) => !v)}>
            + Add a guest
          </Button>
        </div>

        {addingPeople && (
          <div className="border-line space-y-2 rounded-lg border p-3">
            <InvitePicker value={pickerValue} onChange={setPickerValue} selfId={viewerId} />
            <div className="flex gap-2">
              <Button size="sm" onClick={confirmAddFromPicker} disabled={resolvingPicker}>
                {resolvingPicker ? "Adding…" : "Add"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAddingPeople(false);
                  setPickerValue({ userIds: [], kakiIds: [] });
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {addingGuest && (
          <div className="border-line flex flex-wrap items-end gap-2 rounded-lg border p-3">
            <Field label="Name">
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Who's this?"
                className={cn(inputClass, "w-40")}
              />
            </Field>
            <Field label="Phone (optional)">
              <input
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder="Phone number"
                className={cn(inputClass, "w-36")}
              />
            </Field>
            <Button size="sm" onClick={confirmAddGuest} disabled={!guestName.trim()}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAddingGuest(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      <ol className="space-y-2">
        {items.map((item) => (
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
              {roster.map((person) => {
                const active = item.assigneeRefs.includes(person.ref);
                return (
                  <button
                    key={person.ref}
                    type="button"
                    onClick={() => toggleAssignee(item.key, person.ref)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      active ? "bg-ember text-white" : "bg-paper text-stone border-line border"
                    )}
                  >
                    {person.name}
                  </button>
                );
              })}
            </div>
            {item.assigneeRefs.length === 0 && (
              <p className="text-ember text-xs">Nobody&apos;s assigned to this yet.</p>
            )}
          </li>
        ))}
      </ol>

      <Button size="sm" variant="secondary" onClick={addItem}>
        + Add item
      </Button>

      {subtotalMismatch && (
        <p className="bg-amber-tint text-amber-tint-text rounded-lg px-3 py-2 text-xs">
          The items add up to {formatCents(itemsSumCents)}, but the receipt&apos;s subtotal was{" "}
          {formatCents(subtotalCents)} — worth a quick check.
        </p>
      )}

      <div className="border-line space-y-2 border-t pt-3">
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={gstIncluded}
              onChange={(e) => setGstIncluded(e.target.checked)}
            />
            Split GST
          </label>
          <div className="w-20 shrink-0">
            <input
              type="number"
              step="0.01"
              min="0"
              value={(gstCents / 100).toFixed(2)}
              onChange={(e) => setGstCents(Math.round((Number(e.target.value) || 0) * 100))}
              className={cn(inputClass, "min-w-0")}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={serviceChargeIncluded}
              onChange={(e) => setServiceChargeIncluded(e.target.checked)}
            />
            Split service charge
          </label>
          <div className="w-20 shrink-0">
            <input
              type="number"
              step="0.01"
              min="0"
              value={(serviceChargeCents / 100).toFixed(2)}
              onChange={(e) =>
                setServiceChargeCents(Math.round((Number(e.target.value) || 0) * 100))
              }
              className={cn(inputClass, "min-w-0")}
            />
          </div>
        </div>
      </div>

      {registeredRoster.length > 0 && (
        <Field label="Who gets paid back">
          <select
            value={payerUserId}
            onChange={(e) => setPayerUserId(e.target.value)}
            className={inputClass}
          >
            {registeredRoster.map((p) => (
              <option key={p.ref} value={p.userId}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="border-line space-y-1.5 border-t pt-3">
        <p className="text-stone text-xs font-medium tracking-wide uppercase">Running total</p>
        {roster.map((person) => (
          <div key={person.ref} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              {person.userId && <Avatar name={person.name} id={person.userId} size={20} />}
              {person.name}
            </span>
            <span className="tabular-nums">{formatCents(previewOwed(person.ref))}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save the split"}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
}
