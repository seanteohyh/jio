"use client";

import dynamic from "next/dynamic";
import type { Office, Place } from "@/types";

/**
 * Client-only wrapper around the Leaflet map.
 *
 * `ssr: false` is only allowed inside a Client Component in the App Router,
 * which is the entire reason this thin file exists.
 */
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="bg-cream text-stone flex h-full w-full items-center justify-center rounded-xl text-sm">
      Loading map…
    </div>
  ),
});

export default function MapView(props: {
  office: Office;
  places: Place[];
  selectedId?: string | null;
  onSelect?: (place: Place) => void;
  route?: [number, number][] | null;
  pinDropMode?: boolean;
  droppedPin?: { lat: number; lng: number } | null;
  onPinDrop?: (lat: number, lng: number) => void;
}) {
  return <LeafletMap {...props} />;
}
