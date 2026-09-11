"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { formatCuisine } from "@/lib/utils";
import {
  clusterKey,
  clusterPlaces,
  isHighlyRated,
  isNewListing,
} from "@/lib/mapClusters";
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
 *
 * `size` is bumped for a cluster marker (several places sharing one spot,
 * e.g. every stall in a food court geocoding to the same building) — a
 * slightly bigger pin is a cheap, immediate "there's more than one place
 * here" cue on top of the count `label` itself.
 */
function markerIcon(color: string, label?: string, ring?: string, size = 22) {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      background:${color};border:2px solid ${ring ?? "#faf7f2"};
      box-shadow:0 1px 4px rgba(0,0,0,.3);
      font-size:${size > 22 ? 10 : 9}px;color:#fff;font-weight:600;
    "><span style="transform:rotate(45deg)">${label ?? ""}</span></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 2],
  });
}

/** Matches --color-amber, the same tone PlaceCard's "your Kakis" badge uses. */
const KAKI_FAVOURITE_RING = "#d98a2b";

/** The badge row shared by a single-place popup and every row inside a
 *  cluster's list — kept identical so a place reads the same either way. */
function PlaceBadges({ place }: { place: Place }) {
  return (
    <>
      {typeof place.kaki_rating === "number" && (
        <span style={{ color: "#d98a2b" }}>
          ★ {place.kaki_rating.toFixed(1)} · your Kakis
        </span>
      )}
      {isHighlyRated(place) && (
        <span style={{ color: "#567b57" }}>★ Highly rated</span>
      )}
      {isNewListing(place) && <span style={{ color: "#b4532f" }}>New</span>}
    </>
  );
}

/**
 * Suggest Area Filter spec §4 — captures a tap anywhere on the map while
 * pin-drop mode is active and reports its coordinates to the parent. Not
 * simultaneous with place-marker clicks (`onSelect`) — the area picker's
 * "Drop a pin" tab is the only place this mounts.
 */
function PinDropCatcher({
  onPinDrop,
}: {
  onPinDrop: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPinDrop(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function SinglePlaceMarker({
  place,
  selectedId,
  onSelect,
}: {
  place: Place;
  selectedId?: string | null;
  onSelect?: (place: Place) => void;
}) {
  return (
    <Marker
      position={[place.lat, place.lng]}
      icon={markerIcon(
        place.id === selectedId ? "#567b57" : "#b4532f",
        place.walk_minutes ? String(place.walk_minutes) : "",
        typeof place.kaki_rating === "number" ? KAKI_FAVOURITE_RING : undefined
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
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 2,
            fontSize: 12,
          }}
        >
          <PlaceBadges place={place} />
        </div>
        <br />
        <Link href={`/places/${place.id}`} style={{ color: "#b4532f" }}>
          Open
        </Link>
      </Popup>
    </Marker>
  );
}

/**
 * Several places geocoded onto (almost) the same spot — a food court's
 * stalls, a mall's food floor — used to stack invisibly under whichever one
 * happened to render on top, with the rest unreachable without zooming in
 * far enough to actually pull the pins apart. One marker for the whole
 * group, sized up and labelled with the count instead of a walk time (which
 * would be identical across the group anyway); the popup lists every place
 * in it instead of picking one arbitrarily.
 */
function ClusterMarker({
  places,
  selectedId,
  onSelect,
}: {
  places: Place[];
  selectedId?: string | null;
  onSelect?: (place: Place) => void;
}) {
  const anchor = places[0];
  const hasSelected = places.some((p) => p.id === selectedId);
  const hasKakiFavourite = places.some(
    (p) => typeof p.kaki_rating === "number"
  );

  return (
    <Marker
      position={[anchor.lat, anchor.lng]}
      icon={markerIcon(
        hasSelected ? "#567b57" : "#b4532f",
        String(places.length),
        hasKakiFavourite ? KAKI_FAVOURITE_RING : undefined,
        26
      )}
    >
      <Popup maxWidth={260} maxHeight={280}>
        <strong>{places.length} places here</strong>
        <div style={{ marginTop: 4 }}>
          {places.map((place) => (
            <div
              key={place.id}
              style={{
                borderTop: "1px solid #e7ded2",
                marginTop: 6,
                paddingTop: 6,
              }}
            >
              <button
                type="button"
                onClick={() => onSelect?.(place)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  color: "#2b2b2b",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {place.name}
              </button>
              <br />
              <span style={{ color: "#6b665c", fontSize: 12 }}>
                {typeof place.walk_minutes === "number"
                  ? `${place.walk_minutes} min walk · `
                  : ""}
                {place.cuisine.map(formatCuisine).join(", ")}
              </span>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 2,
                  fontSize: 12,
                }}
              >
                <PlaceBadges place={place} />
              </div>
              <br />
              <Link
                href={`/places/${place.id}`}
                style={{ color: "#b4532f", fontSize: 12 }}
              >
                Open
              </Link>
            </div>
          ))}
        </div>
      </Popup>
    </Marker>
  );
}

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
  pinDropMode,
  droppedPin,
  onPinDrop,
}: {
  office: Office;
  places: Place[];
  selectedId?: string | null;
  onSelect?: (place: Place) => void;
  route?: [number, number][] | null;
  /** Suggest Area Filter spec §4 — "Drop a pin" tab only; unset elsewhere. */
  pinDropMode?: boolean;
  droppedPin?: { lat: number; lng: number } | null;
  onPinDrop?: (lat: number, lng: number) => void;
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

  const clusters = useMemo(() => clusterPlaces(places), [places]);

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

      {pinDropMode && onPinDrop && <PinDropCatcher onPinDrop={onPinDrop} />}

      {pinDropMode && droppedPin && (
        <Marker
          position={[droppedPin.lat, droppedPin.lng]}
          icon={markerIcon("#c0392b", "📍")}
        />
      )}

      {/* Suggest Area Filter spec §3 — the pin-drop map is a blank base map
          to tap anywhere on, not a pin to click around; the office marker
          would also swallow the map's own click under it. */}
      {!pinDropMode && (
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
      )}

      {clusters.map((group) =>
        group.length === 1 ? (
          <SinglePlaceMarker
            key={group[0].id}
            place={group[0]}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ) : (
          <ClusterMarker
            key={clusterKey(group[0])}
            places={group}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )
      )}

      {route && route.length > 1 && (
        <Polyline
          positions={route}
          pathOptions={{ color: "#b4532f", weight: 4, opacity: 0.8 }}
        />
      )}
    </MapContainer>
  );
}
