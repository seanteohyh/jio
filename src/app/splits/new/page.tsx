"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Button, Card, Field, SkeletonRows, inputClass } from "@/components/ui";
import { AlertIcon } from "@/components/icons";
import SplitEditor, { type RosterPerson } from "@/components/splits/SplitEditor";
import { fetcher, mutateJson } from "@/lib/fetcher";
import type { BillSplit, EventDetail, LunchEvent } from "@/types";

interface MeResponse {
  user: { id: string } | null;
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

/** Resized client-side before it ever reaches the server — keeps both
 *  Storage usage and the vision API payload small. */
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

/** Who's assignable when starting from a linked Jio — confirmed-going
 *  RSVPs first, falling back to host + invitees, same logic the old
 *  per-event card used. Still just the *starting* roster: fully
 *  editable afterward, never a ceiling. */
function rosterFromEvent(event: EventDetail, viewerId: string): RosterPerson[] {
  const going = event.rsvps.filter((r) => r.response === "yes");
  const pool: RosterPerson[] =
    going.length > 0
      ? going.map((r) => ({
          ref: `user-${r.user_id}`,
          userId: r.user_id,
          name: r.display_name ?? "Teammate",
        }))
      : [
          {
            ref: `user-${event.host_id}`,
            userId: event.host_id,
            name: event.host_name ?? "Host",
          },
          ...event.invitees.map((i) => ({
            ref: `user-${i.user_id}`,
            userId: i.user_id,
            name: i.display_name ?? "Teammate",
          })),
        ];

  const byUser = new Map(pool.map((p) => [p.userId, p]));
  if (!byUser.has(event.host_id)) {
    byUser.set(event.host_id, {
      ref: `user-${event.host_id}`,
      userId: event.host_id,
      name: event.host_name ?? "Host",
    });
  }
  if (!byUser.has(viewerId)) {
    byUser.set(viewerId, { ref: `user-${viewerId}`, userId: viewerId, name: "You" });
  }
  return Array.from(byUser.values());
}

export default function NewSplitPage() {
  return (
    <Suspense fallback={<SkeletonRows />}>
      <NewSplitContent />
    </Suspense>
  );
}

function NewSplitContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lockedEventId = searchParams.get("eventId");

  const { data: me } = useSWR<MeResponse>("/api/me", fetcher);
  const viewerId = me?.user?.id;

  const [linkedEventId, setLinkedEventId] = useState<string | null>(null);
  useEffect(() => {
    if (lockedEventId) setLinkedEventId(lockedEventId);
  }, [lockedEventId]);

  const { data: eventData } = useSWR<{ event: EventDetail }>(
    linkedEventId ? `/api/events/${linkedEventId}` : null,
    fetcher
  );
  const { data: myEventsData } = useSWR<{ events: LunchEvent[] }>(
    !lockedEventId && viewerId ? "/api/events" : null,
    fetcher
  );
  const myClosedJios = (myEventsData?.events ?? []).filter(
    (e) => e.host_id === viewerId && e.status === "closed"
  );

  const [mode, setMode] = useState<"start" | "scanning" | "editing">("start");
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setMode("scanning");
    try {
      const { base64, mediaType } = await downscaleImage(file);
      const result = await mutateJson<ScanResponse>("/api/splits/scan", "POST", {
        imageBase64: base64,
        mediaType,
      });
      setScan(result);
      setMode("editing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not scan that receipt");
      setMode("start");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!viewerId) return <SkeletonRows />;

  if (mode === "editing") {
    const event = linkedEventId ? eventData?.event : undefined;
    const roster = event ? rosterFromEvent(event, viewerId) : [{ ref: `user-${viewerId}`, userId: viewerId, name: "You" }];
    const items = (scan?.receipt?.items ?? []).map((item, i) => ({
      key: `scan-${i}`,
      label: item.label,
      amountCents: item.amount_cents,
      assigneeRefs: [],
    }));

    return (
      <div className="animate-fade-in space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight">Split a bill</h1>
        <SplitEditor
          viewerId={viewerId}
          eventId={linkedEventId}
          initialTitle={event?.title ?? ""}
          initialPayerUserId={viewerId}
          initialRoster={roster}
          initialItems={items}
          initialReceiptImagePath={scan?.receiptImagePath ?? null}
          initialGstCents={scan?.receipt?.gst_cents ?? 0}
          initialGstIncluded={(scan?.receipt?.gst_cents ?? 0) > 0}
          initialServiceChargeCents={scan?.receipt?.service_charge_cents ?? 0}
          initialServiceChargeIncluded={(scan?.receipt?.service_charge_cents ?? 0) > 0}
          initialSubtotalCents={scan?.receipt?.subtotal_cents ?? 0}
          onSaved={(split: BillSplit) => router.push(`/splits/${split.id}`)}
          onCancel={() => setMode("start")}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Split a bill</h1>
        <p className="text-stone mt-1 text-sm">
          Photograph the receipt and let it scan the items, or just type
          them in yourself.
        </p>
      </header>

      {error && (
        <p className="bg-ember-tint text-ember-tint-text flex items-center gap-2 rounded-lg px-3 py-2 text-xs">
          <AlertIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {lockedEventId && eventData?.event && (
        <Card className="text-sm">
          Linked to <span className="font-medium">{eventData.event.title}</span> — its
          participants will be pre-filled below.
        </Card>
      )}

      {!lockedEventId && myClosedJios.length > 0 && (
        <Field label="Link to a Jio (optional)" hint="Pre-fills who's splitting it from that Jio.">
          <select
            value={linkedEventId ?? ""}
            onChange={(e) => setLinkedEventId(e.target.value || null)}
            className={inputClass}
          >
            <option value="">No Jio — just this split</option>
            {myClosedJios.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </Field>
      )}

      {mode === "scanning" ? (
        <p className="text-stone text-sm">Reading the receipt…</p>
      ) : (
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
          <Button onClick={() => fileInputRef.current?.click()}>Take or choose a photo</Button>
          <Button variant="secondary" onClick={() => setMode("editing")}>
            Enter items by hand
          </Button>
        </div>
      )}
    </div>
  );
}
