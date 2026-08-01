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
        const { result, message } = await fetcher<{
          result: { lat: number; lng: number; address: string } | null;
          message?: string;
        }>(`/api/geocode?q=${encodeURIComponent(address.trim())}`);
        if (!result) {
          setError(message ?? "Couldn't find that address");
          setGeocoding(false);
          return;
        }
        resolved = { lat: result.lat, lng: result.lng };
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
          whichever one a Jio is scheduled at.
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
              <Card className="space-y-1">
                <p className="font-medium">{office.name}</p>
                {office.address && (
                  <p className="text-stone text-xs">{office.address}</p>
                )}
                <p className="text-stone font-mono text-xs">
                  {office.lat.toFixed(4)}, {office.lng.toFixed(4)}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
