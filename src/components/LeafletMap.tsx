"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { formatCuisine } from "@/lib/utils";
import type { Office, Place } from "@/types";

/**
 * The actual Leaflet map. Always loaded through `MapView`, never directly —
 * Leaflet touches `window` at import time and will crash a server render.
 *
 * Markers are `divIcon`s rather than the default image markers. The defaults
 * resolve their PNG paths relative to the CSS, which breaks under bundlers
 * and is the single most common Leaflet-in-webpack bug.
 */

/**
 * `ring` is a second, independent signal layered on top of `color` — CHANGES_
 * 20260807c.md §2's map cue for a Kaki favourite. Deliberately not a fill
 * color: `color` already means selected (sage) vs. not (ember), and reusing
 * green for "favourite" would collide with green already meaning "selected"
 * the moment a selected pin is also a favourite. The border can carry a
 * second color without disturbing the first.
 */
function markerIcon(color: string, label?: string, ring?: string) {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:22px;height:22px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      background:${color};border:2px solid ${ring ?? "#faf7f2"};
      box-shadow:0 1px 4px rgba(0,0,0,.3);
      font-size:9px;color:#fff;font-weight:600;
    "><span style="transform:rotate(45deg)">${label ?? ""}</span></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -20],
  });
}

/** Matches --color-amber, the same tone PlaceCard's "your Kakis" badge uses. */
const KAKI_FAVOURITE_RING = "#d98a2b";

/** Refits the viewport when the set of visible places changes. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 16);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 17 });
  }, [map, points]);

  return null;
}

export default function LeafletMap({
  office,
  places,
  selectedId,
  onSelect,
  route,
}: {
  office: Office;
  places: Place[];
  selectedId?: string | null;
  onSelect?: (place: Place) => void;
  route?: [number, number][] | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const points = useMemo<[number, number][]>(
    () => [
      [office.lat, office.lng],
      ...places.map((p) => [p.lat, p.lng] as [number, number]),
    ],
    [office, places]
  );

  if (!mounted) return null;

  return (
    <MapContainer
      center={[office.lat, office.lng]}
      zoom={16}
      scrollWheelZoom
      className="h-full w-full rounded-xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <FitBounds points={points} />

      <Marker
        position={[office.lat, office.lng]}
        icon={markerIcon("#2b2b2b", "🏢")}
      >
        <Popup>
          <strong>{office.name}</strong>
          {office.address && (
            <>
              <br />
              <span style={{ color: "#6b665c" }}>{office.address}</span>
            </>
          )}
        </Popup>
      </Marker>

      {places.map((place) => (
        <Marker
          key={place.id}
          position={[place.lat, place.lng]}
          icon={markerIcon(
            place.id === selectedId ? "#567b57" : "#b4532f",
            place.walk_minutes ? String(place.walk_minutes) : "",
            typeof place.kaki_rating === "number"
              ? KAKI_FAVOURITE_RING
              : undefined
          )}
          eventHandlers={{ click: () => onSelect?.(place) }}
        >
          <Popup>
            <strong>{place.name}</strong>
            <br />
            <span style={{ color: "#6b665c", fontSize: 12 }}>
              {typeof place.walk_minutes === "number"
                ? `${place.walk_minutes} min walk · `
                : ""}
              {place.cuisine.map(formatCuisine).join(", ")}
            </span>
            {typeof place.kaki_rating === "number" && (
              <>
                <br />
                <span style={{ color: "#d98a2b", fontSize: 12 }}>
                  ★ {place.kaki_rating.toFixed(1)} · your Kakis
                </span>
              </>
            )}
            <br />
            <Link href={`/places/${place.id}`} style={{ color: "#b4532f" }}>
              Open
            </Link>
          </Popup>
        </Marker>
      ))}

      {route && route.length > 1 && (
        <Polyline
          positions={route}
          pathOptions={{ color: "#b4532f", weight: 4, opacity: 0.8 }}
        />
      )}
    </MapContainer>
  );
}
