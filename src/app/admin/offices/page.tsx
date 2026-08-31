"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  SectionHeading,
  SkeletonDetail,
  SkeletonRows,
  inputClass,
} from "@/components/ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import type { AuthUser, Office } from "@/types";

interface MeResponse {
  user: (AuthUser & { is_admin: boolean }) | null;
}

/** Shared by the Add and Edit forms — looks up an address or postal code
 *  via the same postal-code-first `/api/geocode` route every other address
 *  field in the app uses. Throws with a user-facing message on failure. */
async function geocode(address: string): Promise<{ lat: number; lng: number }> {
  const { result, message } = await fetcher<{
    result: { lat: number; lng: number; address: string } | null;
    message?: string;
  }>(`/api/geocode?q=${encodeURIComponent(address)}`);
  if (!result) throw new Error(message ?? "Couldn't find that address");
  return { lat: result.lat, lng: result.lng };
}

/**
 * Admin-only. The schema has supported unlimited offices since migration
 * 001 and the API has been admin-gated since 017, but adding one still
 * meant a SQL insert — CHANGES_20260801.md §3e.
 *
 * Real enforcement is server-side (POST /api/offices 403s a non-admin
 * regardless of what this page renders, and RLS backs that in live mode) —
 * the is_admin check here only avoids flashing the form at someone who
 * can't use it, same pattern as /admin/moderation.
 */
export default function OfficesAdminPage() {
  const { data: me, isLoading: meLoading } = useSWR<MeResponse>(
    "/api/me",
    fetcher
  );
  const isAdmin = me?.user?.is_admin ?? false;

  const { data: officesData, mutate: mutateOffices } = useSWR<{
    offices: Office[];
  }>(isAdmin ? "/api/offices" : null, fetcher);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [geocoding, setGeocoding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (meLoading) return <SkeletonDetail />;
  if (!me?.user) return null;

  if (!isAdmin) {
    return (
      <EmptyState
        title="Admins only"
        description="This view is restricted to Jio admins."
      />
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    let resolved = coords;

    if (!resolved) {
      if (!address.trim()) {
        setError("Enter an address or postal code so we can place it on the map");
        return;
      }
      setGeocoding(true);
      try {
        resolved = await geocode(address.trim());
        setCoords(resolved);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not look up that address"
        );
        setGeocoding(false);
        return;
      }
      setGeocoding(false);
    }

    setBusy(true);
    try {
      await mutateJson("/api/offices", "POST", {
        name: name.trim(),
        address: address.trim() || null,
        lat: resolved.lat,
        lng: resolved.lng,
      });
      setName("");
      setAddress("");
      setCoords(null);
      mutateOffices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that office");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Offices</h1>
        <p className="text-stone mt-1 text-sm">
          Every office the app knows about. Walking times are measured from
          whichever one a Jio is scheduled at. Moving to a new building?
          Edit the existing office below rather than adding a second one —
          a Jio with no office chosen still falls back to the same original
          office record, so adding a new one alongside it changes nothing
          until the old one is edited or removed.
        </p>
      </header>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card className="space-y-4">
        <SectionHeading>Add an office</SectionHeading>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Name">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="LazadaOne"
            />
          </Field>
          <Field
            label="Address or postal code"
            hint="We'll look up the coordinates for you."
          >
            <input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setCoords(null);
              }}
              className={inputClass}
              placeholder="51 Bras Basah Rd, Singapore 189554"
            />
          </Field>
          <Button type="submit" disabled={busy || geocoding || !name.trim()}>
            {geocoding ? "Looking up address…" : busy ? "Adding…" : "Add office"}
          </Button>
        </form>
      </Card>

      {!officesData ? (
        <SkeletonRows count={3} rowClassName="h-16 w-full" />
      ) : officesData.offices.length === 0 ? (
        <EmptyState title="No offices yet" description="Add the first one above." />
      ) : (
        <ul className="space-y-2">
          {officesData.offices.map((office) => (
            <li key={office.id}>
              <OfficeRow office={office} onChange={mutateOffices} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One office in the list — a read view plus an inline Edit form (address
 *  re-geocoded the same way as Add) and a Remove action. Editing is the
 *  one action that actually changes what the rest of the app uses this
 *  office for, since every write path defaults to whichever office was
 *  created first, not whichever the admin most recently added. */
function OfficeRow({
  office,
  onChange,
}: {
  office: Office;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(office.name);
  const [address, setAddress] = useState(office.address ?? "");
  const [addressChanged, setAddressChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setName(office.name);
    setAddress(office.address ?? "");
    setAddressChanged(false);
    setError(null);
    setEditing(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("An office name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const patch: {
        name: string;
        address: string | null;
        lat?: number;
        lng?: number;
      } = { name: name.trim(), address: address.trim() || null };

      // Only re-geocode when the address field actually changed — leaving
      // it untouched keeps the office's existing coordinates, same "only
      // look up when there's something new to resolve" rule PlaceForm and
      // the office Add form both already follow.
      if (addressChanged && address.trim()) {
        const resolved = await geocode(address.trim());
        patch.lat = resolved.lat;
        patch.lng = resolved.lng;
      }

      await mutateJson(`/api/offices/${office.id}`, "PATCH", patch);
      setEditing(false);
      onChange();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update that office"
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !window.confirm(
        `Remove ${office.name}? Any Jio already scheduled there keeps its own record — this only removes it from the list.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await mutateJson(`/api/offices/${office.id}`, "DELETE");
      onChange();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not remove that office"
      );
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <Card className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{office.name}</p>
            {office.address && (
              <p className="text-stone text-xs">{office.address}</p>
            )}
            <p className="text-stone font-mono text-xs">
              {office.lat.toFixed(4)}, {office.lng.toFixed(4)}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={startEdit}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
              Remove
            </Button>
          </div>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <form onSubmit={save} className="space-y-3">
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Address or postal code"
          hint="Only re-looked-up if you change this field."
        >
          <input
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setAddressChanged(true);
            }}
            className={inputClass}
          />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
