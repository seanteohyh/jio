"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  SkeletonRows,
  inputClass,
} from "@/components/ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import HintCard from "@/components/HintCard";
import type { Kaki } from "@/types";

export default function KakisPage() {
  const { data, error, isLoading, mutate } = useSWR<{ kakis: Kaki[] }>(
    "/api/kakis",
    fetcher
  );

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setActionError(null);
    try {
      await mutateJson("/api/kakis", "POST", { name: name.trim() });
      setName("");
      setCreating(false);
      mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not create it");
    } finally {
      setBusy(false);
    }
  };

  const kakis = data?.kakis ?? [];

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kakis</h1>
          <p className="text-stone mt-1 text-sm">
            Your lunch groups. Members share stats and can join any Jio linked
            to the group.
          </p>
        </div>
        <Button onClick={() => setCreating((c) => !c)}>
          {creating ? "Cancel" : "New"}
        </Button>
      </header>

      <HintCard page="kakis" icon="👥">
        Kaki means your lunch crew — create one to share stats and jio each
        other faster.
      </HintCard>

      {creating && (
        <Card className="animate-fade-in">
          <form onSubmit={create} className="space-y-3">
            <Field label="Group name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="The 12:15 Crew"
                autoFocus
              />
            </Field>
            {actionError && <ErrorNote>{actionError}</ErrorNote>}
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create group"}
            </Button>
          </form>
        </Card>
      )}

      {error && <ErrorNote>{error.message}</ErrorNote>}
      {isLoading && <SkeletonRows />}

      {!isLoading && kakis.length === 0 && !creating && (
        <EmptyState
          title="You are not in any groups"
          description="Create one and share the invite link, or ask someone to send you theirs."
          action={<Button onClick={() => setCreating(true)}>Create a group</Button>}
        />
      )}

      {kakis.length > 0 && (
        <ul className="space-y-2">
          {kakis.map((kaki) => (
            <li key={kaki.id}>
              <Link
                href={`/kakis/${kaki.id}`}
                className="border-line bg-cream/60 hover:border-ember/40 flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors"
              >
                <span className="truncate font-medium">{kaki.name}</span>
                <span className="text-stone shrink-0 text-xs">
                  {kaki.member_count} member
                  {kaki.member_count === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
