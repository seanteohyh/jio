"use client";

import { useState } from "react";
import { Avatar, Button, Card, SectionHeading, inputClass } from "@/components/ui";
import { AlertIcon } from "@/components/icons";
import { mutateJson } from "@/lib/fetcher";
import { formatCents } from "@/lib/expenses";
import { buildWhatsAppPaymentLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import type { BillSplit } from "@/types";

/** The settled view of a split — per-person owed amount, a way to nudge
 *  them to pay, and host-only corrections. Works identically for a
 *  registered participant or a guest: both are just a
 *  `bill_split_participants` row, a guest just has nothing to
 *  push-notify. */
export default function SplitBreakdown({
  split,
  viewerId,
  canEdit,
  onChanged,
  onEdit,
  onRemove,
}: {
  split: BillSplit;
  viewerId: string;
  canEdit: boolean;
  onChanged: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savePhone = async (participantId: string) => {
    const phone = phoneDrafts[participantId]?.trim();
    if (!phone) return;
    setError(null);
    try {
      await mutateJson(`/api/splits/${split.id}/participants/${participantId}`, "PATCH", {
        phone_number: phone,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that phone number");
    }
  };

  const togglePaid = async (participantId: string, currentlyPaid: boolean) => {
    setError(null);
    try {
      await mutateJson(`/api/splits/${split.id}/participants/${participantId}`, "PATCH", {
        paid: !currentlyPaid,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update paid status");
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove this bill split? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await mutateJson(`/api/splits/${split.id}`, "DELETE");
      onRemove();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the split");
      setBusy(false);
    }
  };

  const others = split.participants.filter((p) => p.user_id !== split.payer_user_id);
  const payer = split.participants.find((p) => p.user_id === split.payer_user_id);

  return (
    <Card className="space-y-3">
      <SectionHeading>{split.title}</SectionHeading>

      {error && (
        <p className="bg-ember-tint text-ember-tint-text flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
          <AlertIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {split.receipt_image_url && (
        <img
          src={split.receipt_image_url}
          alt="The scanned receipt"
          className="border-line max-h-64 w-full rounded-lg border object-contain"
        />
      )}

      <p className="text-stone text-xs">
        {split.payer_user_id === viewerId
          ? "You paid — here's who owes you."
          : `${payer?.display_name ?? "Someone"} paid — here's who owes them.`}
      </p>

      <ul className="space-y-2">
        {others.map((p) => (
          <li key={p.id} className="border-line bg-paper space-y-1.5 rounded-lg border p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm">
                <Avatar name={p.display_name ?? "Someone"} id={p.id} size={22} />
                {p.display_name ?? "Someone"}
                {!p.user_id && <span className="text-stone text-xs">· guest</span>}
                {p.paid_at && <span className="text-ember text-xs font-medium">· Paid</span>}
              </span>
              <span className="text-sm font-medium tabular-nums">{formatCents(p.owed_cents)}</span>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  defaultValue={p.phone_number ?? ""}
                  onChange={(e) => setPhoneDrafts({ ...phoneDrafts, [p.id]: e.target.value })}
                  placeholder="Phone number"
                  className={cn(inputClass, "h-8 max-w-[9rem] text-xs")}
                />
                <Button size="sm" variant="secondary" onClick={() => savePhone(p.id)}>
                  Save
                </Button>
                {p.phone_number && (
                  <a
                    href={buildWhatsAppPaymentLink(p.phone_number, p.owed_cents, split.title)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ember text-xs underline"
                  >
                    Send via WhatsApp
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => togglePaid(p.id, !!p.paid_at)}
                  className="text-stone hover:text-ink ml-auto text-xs underline"
                >
                  {p.paid_at ? "Mark unpaid" : "Mark as paid"}
                </button>
              </div>
            )}
          </li>
        ))}
        {others.length === 0 && <p className="text-stone text-xs">Nobody else owes anything yet.</p>}
      </ul>

      {canEdit && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onEdit}>
            Edit the split
          </Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
            Remove
          </Button>
        </div>
      )}
    </Card>
  );
}
