"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import InvitePicker, { type InviteSelection } from "@/components/InvitePicker";
import { fetcher, mutateJson } from "@/lib/fetcher";
import HintCard from "@/components/HintCard";
import { FirstKakiMotif } from "@/components/brand/motifs";
import type { Kaki } from "@/types";

interface MeResponse {
  user: { id: string } | null;
}

// `useSearchParams` (below, for the "turn this into a Kaki?" pre-fill)
// needs a Suspense boundary around whatever calls it — same shape
// /places' own BrowseList already uses.
export default function KakisPage() {
  return (
    <Suspense fallback={<SkeletonRows />}>
      <KakisContent />
    </Suspense>
  );
}

function KakisContent() {
  const { data, error, isLoading, mutate } = useSWR<{ kakis: Kaki[] }>(
    "/api/kakis",
    fetcher
  );
  const { data: me } = useSWR<MeResponse>("/api/me", fetcher);

  // "Turn this into a Kaki?" (a Jio's own bridge suggestion) lands here
  // with `?prefillUserIds=a,b,c` — the same participants pre-checked in
  // the same picker anyone creating a group from scratch already sees,
  // so the host can still remove someone before confirming.
  const searchParams = useSearchParams();
  const prefillUserIds = useMemo(() => {
    const raw = searchParams.get("prefillUserIds");
    return raw ? raw.split(",").filter(Boolean) : [];
  }, [searchParams]);

  const [name, setName] = useState("");
  const [invite, setInvite] = useState<InviteSelection>({
    userIds: prefillUserIds,
    kakiIds: [],
  });
  const [creating, setCreating] = useState(prefillUserIds.length > 0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setActionError(null);
    try {
      await mutateJson("/api/kakis", "POST", {
        name: name.trim(),
        member_ids: invite.userIds,
      });
      setName("");
      setInvite({ userIds: [], kakiIds: [] });
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
                autoFocus={prefillUserIds.length === 0}
              />
            </Field>
            <InvitePicker
              value={invite}
              onChange={setInvite}
              selfId={me?.user?.id}
              allowKakiGroups={false}
            />
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
          icon={<FirstKakiMotif />}
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
