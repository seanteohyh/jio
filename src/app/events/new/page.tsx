"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Button,
  Card,
  ErrorNote,
  Field,
  SectionHeading,
  inputClass,
} from "@/components/ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { features } from "@/lib/config";
import type { Kaki, Place, ScoredPlace, TeamUser } from "@/types";

function defaultDateTime(): string {
  // Default to 12:15 today, or 12:15 tomorrow if that has already passed.
  const when = new Date();
  when.setSeconds(0, 0);
  if (when.getHours() >= 13) when.setDate(when.getDate() + 1);
  when.setHours(12, 15, 0, 0);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(
    when.getDate()
  )}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

export default function NewEventPage() {
  const router = useRouter();

  const [title, setTitle] = useState("Lunch");
  const [when, setWhen] = useState(defaultDateTime());
  const [kakiId, setKakiId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [invitees, setInvitees] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: suggestData } = useSWR<{ suggestions: ScoredPlace[] }>(
    "/api/suggest?limit=15",
    fetcher
  );
  const { data: kakiData } = useSWR<{ kakis: Kaki[] }>(
    features.kakis ? "/api/kakis" : null,
    fetcher
  );
  const { data: userData } = useSWR<{ users: TeamUser[] }>(
    "/api/users",
    fetcher
  );

  const candidates: Place[] = suggestData?.suggestions.map((s) => s.place) ?? [];

  const toggle = (
    id: string,
    list: string[],
    setter: (next: string[]) => void
  ) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const payload = await mutateJson<{ event: { id: string } }>(
        "/api/events",
        "POST",
        {
          title: title.trim() || "Lunch",
          scheduled_at: new Date(when).toISOString(),
          place_ids: selected,
          kaki_id: kakiId || null,
          invitee_ids: invitees,
        }
      );
      router.push(`/events/${payload.event.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create it");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Start a Jio</h1>
        <p className="text-dolch-muted mt-1 text-sm">
          Pick a few options. Everyone ranks them, and the Borda count settles
          it.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-4">
        <Card className="space-y-4">
          <Field label="What is it">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="Friday team lunch"
            />
          </Field>

          <Field label="When">
            <input
              type="datetime-local"
              required
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className={inputClass}
            />
          </Field>

          {features.kakis && kakiData?.kakis && kakiData.kakis.length > 0 && (
            <Field
              label="Link to a group"
              hint="Group members can add options and vote without a separate invite."
            >
              <select
                value={kakiId}
                onChange={(e) => setKakiId(e.target.value)}
                className={inputClass}
              >
                <option value="">No group</option>
                {kakiData.kakis.map((kaki) => (
                  <option key={kaki.id} value={kaki.id}>
                    {kaki.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Card>

        <Card>
          <SectionHeading>Options to vote on</SectionHeading>
          <p className="text-dolch-muted mb-3 text-xs">
            Suggested for you, best first. Invitees can add more once it is
            open.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidates.length === 0 && (
              <span className="text-dolch-muted text-xs">Loading…</span>
            )}
            {candidates.map((place) => {
              const active = selected.includes(place.id);
              return (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => toggle(place.id, selected, setSelected)}
                  className={
                    active
                      ? "bg-dolch-accent rounded-full px-2.5 py-1 text-xs text-white"
                      : "border-dolch-border text-dolch-muted hover:border-dolch-accent rounded-full border px-2.5 py-1 text-xs"
                  }
                >
                  {place.name}
                  {typeof place.walk_minutes === "number" && (
                    <span className="opacity-70"> · {place.walk_minutes}m</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-dolch-muted mt-2 text-xs">
            {selected.length} selected
          </p>
        </Card>

        {userData?.users && userData.users.length > 1 && (
          <Card>
            <SectionHeading>Invite people</SectionHeading>
            <p className="text-dolch-muted mb-3 text-xs">
              Optional if you linked a group.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {userData.users.map((user) => {
                const active = invitees.includes(user.user_id);
                return (
                  <button
                    key={user.user_id}
                    type="button"
                    onClick={() =>
                      toggle(user.user_id, invitees, setInvitees)
                    }
                    className={
                      active
                        ? "bg-dolch-accent rounded-full px-2.5 py-1 text-xs text-white"
                        : "border-dolch-border text-dolch-muted hover:border-dolch-accent rounded-full border px-2.5 py-1 text-xs"
                    }
                  >
                    {user.display_name}
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex gap-2">
          <Button type="submit" disabled={busy || selected.length === 0}>
            {busy ? "Starting…" : "Start the Jio"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
