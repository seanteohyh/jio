"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Button, Card, SkeletonRows } from "@/components/ui";
import { AlertIcon } from "@/components/icons";
import SplitBreakdown from "@/components/splits/SplitBreakdown";
import SplitEditor, { type RosterPerson } from "@/components/splits/SplitEditor";
import { fetcher } from "@/lib/fetcher";
import type { BillSplit } from "@/types";

interface MeResponse {
  user: { id: string } | null;
}

function rosterFromSplit(split: BillSplit): RosterPerson[] {
  return split.participants.map((p) => ({
    ref: p.id,
    participantId: p.id,
    userId: p.user_id ?? undefined,
    guestName: p.guest_name ?? undefined,
    name: p.display_name ?? "Someone",
    phoneNumber: p.phone_number,
  }));
}

export default function SplitDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<{ split: BillSplit }>(
    `/api/splits/${params.id}`,
    fetcher
  );
  const { data: me } = useSWR<MeResponse>("/api/me", fetcher);
  const viewerId = me?.user?.id;
  const [editing, setEditing] = useState(false);

  if (isLoading) return <SkeletonRows />;

  if (error || !data?.split) {
    return (
      <Card className="flex items-center gap-2 text-sm">
        <AlertIcon className="text-ember h-4 w-4 shrink-0" aria-hidden="true" />
        Can&apos;t find that bill split — the link might be old.
      </Card>
    );
  }

  const split = data.split;
  const canEdit = !!viewerId && split.created_by === viewerId;

  if (editing && viewerId) {
    return (
      <div className="animate-fade-in space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight">Edit the split</h1>
        <SplitEditor
          viewerId={viewerId}
          splitId={split.id}
          initialTitle={split.title}
          initialPayerUserId={split.payer_user_id}
          initialRoster={rosterFromSplit(split)}
          initialItems={split.items.map((item) => ({
            key: item.id,
            label: item.label,
            amountCents: item.amount_cents,
            assigneeRefs: item.assignee_ids,
            discountAmountCents: item.discount_amount_cents,
            discountPercent: item.discount_percent,
            discountScope: item.discount_scope,
          }))}
          initialReceiptImagePath={split.receipt_image_path}
          initialReceiptImageUrl={split.receipt_image_url}
          initialGstCents={split.gst_cents}
          initialGstIncluded={split.gst_included}
          initialServiceChargeCents={split.service_charge_cents}
          initialServiceChargeIncluded={split.service_charge_included}
          initialSubtotalCents={split.subtotal_cents}
          initialDiscountPercent={split.discount_percent}
          onSaved={() => {
            setEditing(false);
            mutate();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5">
      <SplitBreakdown
        split={split}
        viewerId={viewerId ?? ""}
        canEdit={canEdit}
        onChanged={() => mutate()}
        onEdit={() => setEditing(true)}
        onRemove={() => router.push("/splits")}
      />
      {split.event_id && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/events/${split.event_id}`)}
        >
          View the linked Jio
        </Button>
      )}
    </div>
  );
}
