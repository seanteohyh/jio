"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Avatar,
  Button,
  Card,
  ErrorNote,
  SectionHeading,
  Spinner,
} from "@/components/ui";
import { KakiMetricsCharts } from "@/components/MetricsCharts";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { formatDate } from "@/lib/utils";
import type { KakiDetail, KakiMetrics } from "@/types";

interface KakiResponse {
  kaki: KakiDetail;
  metrics: KakiMetrics;
  viewer: { id: string; isMember: boolean; isCreator: boolean };
}

export default function KakiDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data, error, isLoading } = useSWR<KakiResponse>(
    `/api/kakis/${id}`,
    fetcher
  );

  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorNote>{error.message}</ErrorNote>;
  if (!data) return null;

  const { kaki, metrics, viewer } = data;

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/k/${kaki.invite_token}`
      : `/k/${kaki.invite_token}`;

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the link is on screen to copy by hand.
    }
  };

  const leave = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await mutateJson(`/api/kakis/${id}`, "DELETE");
      router.push("/kakis");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not leave");
      setBusy(false);
    }
  };

  const nameFor = (userId: string) =>
    kaki.members.find((m) => m.user_id === userId)?.display_name ??
    `Teammate ${userId.slice(0, 6)}`;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{kaki.name}</h1>
        <p className="text-stone mt-1 text-sm">
          {kaki.members.length} member{kaki.members.length === 1 ? "" : "s"}
          {kaki.created_at && ` · since ${formatDate(kaki.created_at)}`}
        </p>
      </header>

      {actionError && <ErrorNote>{actionError}</ErrorNote>}

      <Card>
        <SectionHeading>Members</SectionHeading>
        <ul className="space-y-2">
          {kaki.members.map((member) => (
            <li key={member.user_id} className="flex items-center gap-2.5">
              <Avatar
                name={member.display_name ?? "Teammate"}
                id={member.user_id}
              />
              <span className="text-sm">
                {member.display_name ?? `Teammate ${member.user_id.slice(0, 6)}`}
                {member.user_id === kaki.created_by && (
                  <span className="text-stone text-xs"> · created it</span>
                )}
                {member.user_id === viewer.id && (
                  <span className="text-stone text-xs"> · you</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionHeading>Invite link</SectionHeading>
        <p className="text-stone mb-2 text-xs">
          Anyone with this link can join. It is unguessable, but it is not a
          secret once you have shared it.
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={inviteUrl}
            className="border-line bg-paper text-stone flex-1 truncate rounded-lg border px-3 py-2 text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button size="sm" onClick={copyInvite}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </Card>

      <section>
        <SectionHeading>Group stats</SectionHeading>
        <p className="text-stone mb-3 text-xs">
          Built from visits members have shared. Private visits stay private, so
          these numbers are a floor, not a full picture.
        </p>
        <KakiMetricsCharts metrics={metrics} nameFor={nameFor} />
      </section>

      {viewer.isMember && (
        <Button variant="danger" onClick={leave} disabled={busy}>
          Leave this group
        </Button>
      )}
    </div>
  );
}
