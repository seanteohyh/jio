"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  SectionHeading,
  SkeletonDetail,
  SkeletonRows,
} from "@/components/ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/utils";
import type {
  AccountMergePreview,
  AuthUser,
  DuplicateProfileGroup,
  TeamUser,
} from "@/types";

interface MeResponse {
  user: (AuthUser & { is_admin: boolean }) | null;
}

/** Issues a recovery link for one account on demand — the admin-issued
 *  half of CHANGES_20260807.md §4/§5's collision-safe recovery path, for
 *  someone who's already locked out with nothing saved. */
function RecoveryLinkButton({ userId }: { userId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const getLink = async () => {
    setBusy(true);
    try {
      const result = await mutateJson<{ token: string; url: string }>(
        "/api/recovery-link",
        "POST",
        { user_id: userId }
      );
      setUrl(
        typeof window !== "undefined"
          ? `${window.location.origin}${result.url}`
          : result.url
      );
    } catch {
      // Surfaced via the button staying put — the page-level error banner
      // covers merge failures; a link-issue failure is low-stakes enough
      // to just let the admin try again.
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Selectable text below still works as a fallback.
    }
  };

  if (url) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-stone max-w-[16rem] truncate font-mono text-xs select-all">
          {url}
        </span>
        <Button size="sm" variant="ghost" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={getLink}>
      {busy ? "…" : "Get recovery link"}
    </Button>
  );
}

/**
 * Admin-only — CHANGES_20260807.md §5. Every group here is 2+ profiles
 * sharing a case/whitespace-normalized display name: almost certainly one
 * real person who hit the identity-loss bug (§1) more than once, not a
 * coincidence worth double-checking case by case.
 *
 * Real enforcement is server-side, same as every other admin page: this
 * page's `is_admin` check just avoids flashing controls at someone who
 * can't use them, `merge_user_accounts` (migration 040) is the actual gate.
 */
export default function AccountsPage() {
  const { data: me, isLoading: meLoading } = useSWR<MeResponse>(
    "/api/me",
    fetcher
  );
  const isAdmin = me?.user?.is_admin ?? false;

  const { data, mutate } = useSWR<{ groups: DuplicateProfileGroup[] }>(
    isAdmin ? "/api/admin/duplicate-accounts" : null,
    fetcher
  );

  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({});
  const [mergeByGroup, setMergeByGroup] = useState<Record<string, Set<string>>>(
    {}
  );
  const [previewByGroup, setPreviewByGroup] = useState<
    Record<string, AccountMergePreview[]>
  >({});
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: searchData } = useSWR<{ users: TeamUser[] }>(
    isAdmin && search.trim()
      ? `/api/users?q=${encodeURIComponent(search.trim())}`
      : null,
    fetcher
  );

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

  const keepFor = (group: DuplicateProfileGroup) =>
    keepByGroup[group.normalized_name] ?? group.accounts[0].user_id;

  const mergeSetFor = (group: DuplicateProfileGroup) => {
    const existing = mergeByGroup[group.normalized_name];
    if (existing) return existing;
    // Default: everyone except whichever account is picked to keep.
    const keep = keepFor(group);
    return new Set(
      group.accounts.map((a) => a.user_id).filter((id) => id !== keep)
    );
  };

  const setKeep = (group: DuplicateProfileGroup, userId: string) => {
    setKeepByGroup((prev) => ({ ...prev, [group.normalized_name]: userId }));
    setMergeByGroup((prev) => ({
      ...prev,
      [group.normalized_name]: new Set(
        group.accounts.map((a) => a.user_id).filter((id) => id !== userId)
      ),
    }));
    setPreviewByGroup((prev) => {
      const next = { ...prev };
      delete next[group.normalized_name];
      return next;
    });
  };

  const toggleMerge = (group: DuplicateProfileGroup, userId: string) => {
    const current = new Set(mergeSetFor(group));
    if (current.has(userId)) current.delete(userId);
    else current.add(userId);
    setMergeByGroup((prev) => ({ ...prev, [group.normalized_name]: current }));
    setPreviewByGroup((prev) => {
      const next = { ...prev };
      delete next[group.normalized_name];
      return next;
    });
  };

  const preview = async (group: DuplicateProfileGroup) => {
    setBusyGroup(group.normalized_name);
    setError(null);
    try {
      const keep = keepFor(group);
      const mergeIds = Array.from(mergeSetFor(group));
      const params = new URLSearchParams();
      for (const id of [keep, ...mergeIds]) params.append("user_id", id);
      const res = await fetch(`/api/admin/account-preview?${params}`);
      if (!res.ok) throw new Error((await res.json())?.error ?? "Could not load a preview");
      const body = (await res.json()) as { previews: AccountMergePreview[] };
      setPreviewByGroup((prev) => ({
        ...prev,
        [group.normalized_name]: body.previews,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load a preview");
    } finally {
      setBusyGroup(null);
    }
  };

  const merge = async (group: DuplicateProfileGroup) => {
    const keep = keepFor(group);
    const mergeIds = Array.from(mergeSetFor(group));
    if (mergeIds.length === 0) return;

    setBusyGroup(group.normalized_name);
    setError(null);
    try {
      await mutateJson("/api/admin/merge-accounts", "POST", {
        keep_user_id: keep,
        merge_user_ids: mergeIds,
      });
      setPreviewByGroup((prev) => {
        const next = { ...prev };
        delete next[group.normalized_name];
        return next;
      });
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not merge those accounts");
    } finally {
      setBusyGroup(null);
    }
  };

  const groups = data?.groups ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-stone mt-1 text-sm">
          Possible duplicates — same name, different accounts. Almost always
          one person who hit the identity-loss bug more than once.
        </p>
      </header>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card className="space-y-3">
        <SectionHeading>Issue a recovery link</SectionHeading>
        <p className="text-stone text-xs">
          For anyone already locked out with nothing saved — find them and
          send the link directly. Not just for duplicates: this works for
          any account.
        </p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="border-line bg-paper w-full rounded-lg border px-3 py-2 text-sm"
        />
        {search.trim() && (
          <ul className="space-y-2">
            {(searchData?.users ?? []).length === 0 && (
              <li className="text-stone text-xs">No match.</li>
            )}
            {(searchData?.users ?? []).map((teammate) => (
              <li
                key={teammate.user_id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-ink truncate">{teammate.display_name}</span>
                <RecoveryLinkButton userId={teammate.user_id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!data ? (
        <SkeletonRows count={3} rowClassName="h-24 w-full" />
      ) : groups.length === 0 ? (
        <EmptyState
          title="Nothing to merge"
          description="No two accounts currently share a name."
        />
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => {
            const keep = keepFor(group);
            const mergeSet = mergeSetFor(group);
            const groupPreviews = previewByGroup[group.normalized_name];
            const busy = busyGroup === group.normalized_name;

            return (
              <li key={group.normalized_name}>
                <Card className="space-y-3">
                  <SectionHeading>
                    "{group.accounts[0].display_name}" ·{" "}
                    {group.accounts.length} accounts
                  </SectionHeading>

                  <ul className="space-y-2">
                    {group.accounts.map((account) => (
                      <li
                        key={account.user_id}
                        className="flex items-center gap-3 text-sm"
                      >
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`keep-${group.normalized_name}`}
                            checked={keep === account.user_id}
                            onChange={() => setKeep(group, account.user_id)}
                          />
                          Keep
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            disabled={keep === account.user_id}
                            checked={
                              keep !== account.user_id &&
                              mergeSet.has(account.user_id)
                            }
                            onChange={() => toggleMerge(group, account.user_id)}
                          />
                          Merge in
                        </label>
                        <span className="text-ink min-w-0 flex-1 truncate">
                          {account.display_name}
                        </span>
                        <span className="text-stone shrink-0 text-xs">
                          {account.created_at
                            ? formatDateTime(account.created_at)
                            : ""}
                        </span>
                        <RecoveryLinkButton userId={account.user_id} />
                      </li>
                    ))}
                  </ul>

                  {groupPreviews && (
                    <div className="border-line space-y-2 rounded-xl border p-3 text-xs">
                      {groupPreviews.map((p) => (
                        <div key={p.user_id}>
                          <p className="text-ink font-medium">
                            {p.user_id === keep ? "Keeping: " : "Moving from: "}
                            {p.display_name}
                          </p>
                          <p className="text-stone">
                            {Object.entries(p.counts)
                              .filter(([, count]) => count > 0)
                              .map(([label, count]) => `${count} ${label}`)
                              .join(" · ") || "Nothing to move"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || mergeSet.size === 0}
                      onClick={() => preview(group)}
                    >
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy || mergeSet.size === 0 || !groupPreviews}
                      onClick={() => merge(group)}
                    >
                      {busy ? "Merging…" : "Confirm merge"}
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
