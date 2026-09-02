"use client";

import { useMemo, useRef, useState } from "react";
import { Button, TintPill, inputClass } from "@/components/ui";
import { CloseIcon } from "@/components/icons";
import MapView from "@/components/MapView";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { DEFAULT_OFFICE } from "@/lib/constants";
import { STATIONS } from "@/lib/stations";

export interface AreaSelection {
  label: string;
  lat: number;
  lng: number;
}

const MAX_STATION_MATCHES = 20;

/**
 * Suggest Area Filter spec §2/§3 — the area picker. Deliberately per-request,
 * not stored on the Jio: `value`/`onChange` are lifted to the caller
 * (`JioForm`), which folds the result straight into its existing
 * `suggestQuery` string as `areaLat`/`areaLng` and lets the existing
 * `useSWR` call re-fetch. Nothing here writes anything, so switching areas
 * mid-session is just another tap and re-fetch — no state to reconcile.
 *
 * Two tabs only — station search and drop-a-pin — no free-text field.
 * Free-text/address search (direction A in the spec) is explicitly
 * deferred, not a missing third tab.
 */
export default function AreaPicker({
  value,
  onChange,
}: {
  value: AreaSelection | null;
  onChange: (area: AreaSelection | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"station" | "pin">("station");
  const [stationQuery, setStationQuery] = useState("");
  const [droppedPin, setDroppedPin] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogFocus(open, dialogRef, () => setOpen(false));

  const trimmed = stationQuery.trim().toLowerCase();
  const matches = useMemo(() => {
    if (trimmed.length === 0) return [];
    return STATIONS.filter((s) => s.name.toLowerCase().includes(trimmed)).slice(
      0,
      MAX_STATION_MATCHES
    );
  }, [trimmed]);

  const openPicker = () => {
    setTab("station");
    setStationQuery("");
    setDroppedPin(null);
    setOpen(true);
  };

  const chooseStation = (station: (typeof STATIONS)[number]) => {
    onChange({ label: station.name, lat: station.lat, lng: station.lng });
    setOpen(false);
  };

  const usePin = () => {
    if (!droppedPin) return;
    onChange({ label: "Dropped pin", lat: droppedPin.lat, lng: droppedPin.lng });
    setOpen(false);
  };

  return (
    <>
      {value ? (
        <span className="bg-ember-tint text-ember-tint-text inline-flex items-center gap-1.5 rounded-full py-1.5 pr-2.5 pl-3 text-xs font-medium">
          <button
            type="button"
            onClick={openPicker}
            className="inline-flex items-center gap-1"
          >
            <span aria-hidden="true">📍</span> {value.label}
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Clear ${value.label}, back to anywhere near office`}
            className="hover:opacity-70"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          className="border-line text-stone hover:border-ember hover:text-ember rounded-full border px-3 py-1.5 text-xs"
        >
          <span aria-hidden="true">📍</span> Anywhere near office
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 md:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Choose an area"
            onClick={(e) => e.stopPropagation()}
            className="bg-paper max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl p-4"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-ink text-sm font-semibold">Choose an area</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-stone hover:text-ink p-1"
              >
                <CloseIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setTab("station")}
                className={
                  tab === "station"
                    ? "bg-ember rounded-full px-3 py-1.5 text-xs font-medium text-white"
                    : "border-line text-stone rounded-full border px-3 py-1.5 text-xs"
                }
              >
                Station
              </button>
              <button
                type="button"
                onClick={() => setTab("pin")}
                className={
                  tab === "pin"
                    ? "bg-ember rounded-full px-3 py-1.5 text-xs font-medium text-white"
                    : "border-line text-stone rounded-full border px-3 py-1.5 text-xs"
                }
              >
                Drop a pin
              </button>
            </div>

            {tab === "station" ? (
              <div>
                <input
                  autoFocus
                  value={stationQuery}
                  onChange={(e) => setStationQuery(e.target.value)}
                  placeholder="Search a station…"
                  className={inputClass}
                />
                <div className="mt-2 max-h-72 overflow-y-auto">
                  {trimmed.length === 0 && (
                    <p className="text-stone py-3 text-xs">
                      Type to search a station.
                    </p>
                  )}
                  {trimmed.length > 0 && matches.length === 0 && (
                    <p className="text-stone py-3 text-xs">
                      No stations match &ldquo;{stationQuery}&rdquo;.
                    </p>
                  )}
                  {matches.map((station) => (
                    <button
                      key={station.name}
                      type="button"
                      onClick={() => chooseStation(station)}
                      className="border-line hover:bg-cream flex w-full items-center justify-between gap-2 border-b py-2.5 text-left last:border-none"
                    >
                      <span className="text-ink text-sm">{station.name}</span>
                      <TintPill tone="walk">{station.lines.join("/")}</TintPill>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="h-64 overflow-hidden rounded-xl">
                  <MapView
                    office={DEFAULT_OFFICE}
                    places={[]}
                    pinDropMode
                    droppedPin={droppedPin}
                    onPinDrop={(lat, lng) => setDroppedPin({ lat, lng })}
                  />
                </div>
                <p className="text-stone mt-2 text-xs">
                  Tap anywhere on the map to place a pin.
                </p>
                <Button
                  type="button"
                  className="mt-2 w-full"
                  disabled={!droppedPin}
                  onClick={usePin}
                >
                  Use this spot
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
