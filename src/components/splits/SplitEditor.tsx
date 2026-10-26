"use client";

import { useEffect, useState } from "react";
import InvitePicker, { type InviteSelection } from "@/components/InvitePicker";
import { Avatar, Button, Card, Field, inputClass } from "@/components/ui";
import { AlertIcon } from "@/components/icons";
import { mutateJson, fetcher } from "@/lib/fetcher";
import { formatCents } from "@/lib/expenses";
import { cn } from "@/lib/utils";
import type { BillSplit, KakiDetail, TeamUser } from "@/types";

// Typical Singapore F&B rates — a starting estimate, not a per-split
// setting: ticking "Split GST"/"Split service charge" on auto-fills the
// amount from these (service charge off subtotal, GST off subtotal plus
// service charge if that's also included, matching how a real receipt
// stacks them), but only when the field is still at zero, so it never
// clobbers a typed-in or OCR-scanned amount. Always freely editable
// afterward — a particular restaurant's actual rate can differ.
const GST_RATE = 0.09;
const SERVICE_CHARGE_RATE = 0.1;

/**
 * A plain decimal-text input that never fights what's being typed. A
 * `type="number"` field re-formats to a fixed "X.XX" on every keystroke,
 * which makes clearing a "0.00" placeholder and typing over it unreliable
 * on mobile (nothing to cleanly select, cursor jumps on each render).
 * This tracks the exact string being typed as its own state, only
 * reporting a parsed cents value upward, and re-syncs from the outside
 * (an auto-calculated GST, a freshly scanned amount) only while not
 * focused, so it never overwrites an in-progress edit.
 */
function MoneyInput({
  cents,
  onChangeCents,
  className,
}: {
  cents: number;
  onChangeCents: (cents: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(cents === 0 ? "" : (cents / 100).toFixed(2));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(cents === 0 ? "" : (cents / 100).toFixed(2));
  }, [cents, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(cents === 0 ? "" : (cents / 100).toFixed(2));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^\d*\.?\d{0,2}$/.test(raw)) return;
        setText(raw);
        onChangeCents(Math.round((Number(raw) || 0) * 100));
      }}
      className={className}
    />
  );
}

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

  /** "Go Dutch" assigns each item to whoever actually had it (the
   *  itemized flow below). "Split evenly" ignores items entirely — one
   *  total, divided equally across everyone in the roster, same math as
   *  a single item shared by the whole table. Switching back to "Go
   *  Dutch" never loses the itemized list — only `save()` decides which
   *  one actually gets sent. */
  const [mode, setMode] = useState<"dutch" | "even">("dutch");
  const [evenTotalCents, setEvenTotalCents] = useState(() => {
    const itemsSum = (initialItems ?? []).reduce((sum, item) => sum + item.amountCents, 0);
    return itemsSum || (initialGstCents ?? 0) + (initialServiceChargeCents ?? 0);
  });

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

  /** Whether an item is currently shared by the whole roster — derived,
   *  not stored: true exactly when its assignees are everyone in the
   *  roster right now. Checking the box is a one-tap "assign everyone";
   *  it isn't kept in sync afterward, so adding someone new un-checks it
   *  until re-confirmed, rather than silently growing who owes. */
  const isSharedByAll = (item: DraftItem): boolean =>
    roster.length > 0 &&
    item.assigneeRefs.length === roster.length &&
    roster.every((p) => item.assigneeRefs.includes(p.ref));
  const toggleShared = (key: string, shared: boolean) => {
    updateItem(key, { assigneeRefs: shared ? roster.map((p) => p.ref) : [] });
  };

  const toggleGstIncluded = (checked: boolean) => {
    setGstIncluded(checked);
    if (checked && gstCents === 0) {
      const base = itemsSumCents + (serviceChargeIncluded ? serviceChargeCents : 0);
      setGstCents(Math.round(base * GST_RATE));
    }
  };
  const toggleServiceChargeIncluded = (checked: boolean) => {
    setServiceChargeIncluded(checked);
    if (checked && serviceChargeCents === 0) {
      setServiceChargeCents(Math.round(itemsSumCents * SERVICE_CHARGE_RATE));
    }
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

  // "Split evenly" reuses the exact same per-item math as "Go Dutch" —
  // it's just one synthetic item (the whole total) assigned to everyone
  // in the roster, which divides out to an equal share automatically,
  // GST/service charge included in that one number rather than added
  // separately on top.
  const effectiveItems: DraftItem[] =
    mode === "dutch"
      ? items
      : [
          {
            key: "__even__",
            label: "Shared bill",
            amountCents: evenTotalCents,
            assigneeRefs: roster.map((p) => p.ref),
          },
        ];
  const effectiveGstCents = mode === "dutch" ? gstCents : 0;
  const effectiveGstIncluded = mode === "dutch" ? gstIncluded : false;
  const effectiveServiceChargeCents = mode === "dutch" ? serviceChargeCents : 0;
  const effectiveServiceChargeIncluded = mode === "dutch" ? serviceChargeIncluded : false;

  // Live preview of each person's share while assigning — the server
  // recomputes this authoritatively on save; this is just immediate
  // feedback, same arithmetic as hydrateSplit on both repos.
  const itemsCentsByRef = new Map<string, number>();
  let totalAssignedCents = 0;
  for (const item of effectiveItems) {
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
    const gst = effectiveGstIncluded ? effectiveGstCents * proportion : 0;
    const svc = effectiveServiceChargeIncluded ? effectiveServiceChargeCents * proportion : 0;
    return Math.round(itemsCents + gst + svc);
  };

  const itemsSumCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  const subtotalMismatch =
    mode === "dutch" && subtotalCents > 0 && Math.abs(subtotalCents - itemsSumCents) > 1;

  const save = async () => {
    if (mode === "dutch" && items.some((item) => !item.label.trim())) {
      setError("Every item needs a name");
      return;
    }
    if (mode === "even" && evenTotalCents <= 0) {
      setError("Enter a total to split");
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
        items: effectiveItems.map((item) => ({
          label: item.label.trim(),
          amount_cents: item.amountCents,
          assignee_refs: item.assigneeRefs,
        })),
        subtotal_cents: mode === "dutch" ? subtotalCents : 0,
        gst_cents: effectiveGstCents,
        service_charge_cents: effectiveServiceChargeCents,
        gst_included: effectiveGstIncluded,
        service_charge_included: effectiveServiceChargeIncluded,
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
    const hasDraft = items.length > 0 || evenTotalCents > 0;
    if (hasDraft && !window.confirm("Discard your changes to this split?")) return;
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

      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name="split-mode"
            checked={mode === "dutch"}
            onChange={() => setMode("dutch")}
          />
          Go Dutch — pay for what you had
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name="split-mode"
            checked={mode === "even"}
            onChange={() => setMode("even")}
          />
          Split evenly — one total, divided equally
        </label>
      </div>

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

      {mode === "dutch" ? (
        <>
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
                    <MoneyInput
                      cents={item.amountCents}
                      onChangeCents={(amountCents) => updateItem(item.key, { amountCents })}
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
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={isSharedByAll(item)}
                    onChange={(e) => toggleShared(item.key, e.target.checked)}
                  />
                  Shared by everyone
                </label>
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
              The items add up to {formatCents(itemsSumCents)}, but the receipt&apos;s subtotal
              was {formatCents(subtotalCents)} — worth a quick check.
            </p>
          )}

          <div className="border-line space-y-2 border-t pt-3">
            <p className="text-stone text-xs">
              Ticking either one fills in Singapore&apos;s usual rate (9% GST, 10% service
              charge) — leave unticked if this receipt doesn&apos;t have one, or edit the amount
              if it's different.
            </p>
            <div className="flex items-center gap-2">
              <label className="flex flex-1 items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={gstIncluded}
                  onChange={(e) => toggleGstIncluded(e.target.checked)}
                />
                Split GST
              </label>
              <div className="w-20 shrink-0">
                <MoneyInput
                  cents={gstCents}
                  onChangeCents={setGstCents}
                  className={cn(inputClass, "min-w-0")}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex flex-1 items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={serviceChargeIncluded}
                  onChange={(e) => toggleServiceChargeIncluded(e.target.checked)}
                />
                Split service charge
              </label>
              <div className="w-20 shrink-0">
                <MoneyInput
                  cents={serviceChargeCents}
                  onChangeCents={setServiceChargeCents}
                  className={cn(inputClass, "min-w-0")}
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <Field label="Total to split evenly" hint="Already inclusive of GST/service charge, if any.">
          <div className="w-32">
            <MoneyInput
              cents={evenTotalCents}
              onChangeCents={setEvenTotalCents}
              className={cn(inputClass, "min-w-0")}
            />
          </div>
        </Field>
      )}

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
