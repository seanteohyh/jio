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
import { formatCuisine } from "@/lib/utils";
import type { AuthUser, CuisineMergePreview, CuisineOption } from "@/types";

interface MeResponse {
  user: (AuthUser & { is_admin: boolean }) | null;
}

/**
 * Admin-only — CHANGES_20260818.md §6's combine tool. Normalizing a typed
 * cuisine on write (slugifyCuisine) catches exact duplicates for free but
 * not near-duplicates ("Korean BBQ" / "korean bbq" / "KBBQ") — this is
 * where those get folded together after the fact, same "pick keep, check
 * the rest, preview, confirm" shape as `/admin/accounts`, just pointed at
 * cuisines instead of accounts. Real enforcement is server-side, same as
 * every other admin page: this page's `is_admin` check just avoids
 * flashing controls at someone who can't use them.
 */
export default function CuisinesAdminPage() {
  const { data: me, isLoading: meLoading } = useSWR<MeResponse>(
    "/api/me",
    fetcher
  );
  const isAdmin = me?.user?.is_admin ?? false;

  const { data, mutate } = useSWR<{ cuisines: CuisineOption[] }>(
    isAdmin ? "/api/cuisines" : null,
    fetcher
  );

  const [keep, setKeep] = useState("");
  const [mergeSet, setMergeSet] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<CuisineMergePreview[] | null>(null);
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

  const cuisines = data?.cuisines ?? [];

  const setKeepSlug = (slug: string) => {
    setKeep(slug);
    setMergeSet((prev) => {
      const next = new Set(prev);
      next.delete(slug);
      return next;
    });
    setPreview(null);
  };

  const toggleMerge = (slug: string) => {
    if (!keep || slug === keep) return;
    setMergeSet((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
    setPreview(null);
  };

  const runPreview = async () => {
    if (!keep || mergeSet.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      for (const slug of [keep, ...mergeSet]) params.append("slug", slug);
      const res = await fetch(`/api/admin/cuisine-preview?${params}`);
      if (!res.ok) {
        throw new Error((await res.json())?.error ?? "Could not load a preview");
      }
      const body = (await res.json()) as { previews: CuisineMergePreview[] };
      setPreview(body.previews);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load a preview");
    } finally {
      setBusy(false);
    }
  };

  const runMerge = async () => {
    if (!keep || mergeSet.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await mutateJson("/api/admin/merge-cuisines", "POST", {
        keep_cuisine_slug: keep,
        merge_cuisine_slugs: Array.from(mergeSet),
      });
      setPreview(null);
      setMergeSet(new Set());
      mutate();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not merge those cuisines"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Cuisines</h1>
        <p className="text-stone mt-1 text-sm">
          Combine near-duplicates — &ldquo;Korean BBQ&rdquo;, &ldquo;korean
          bbq&rdquo;, &ldquo;KBBQ&rdquo; — into one. Every place and taste
          preference referencing the merged-away cuisine moves over
          automatically.
        </p>
      </header>

      {error && <ErrorNote>{error}</ErrorNote>}

      {!data ? (
        <SkeletonRows count={3} rowClassName="h-10 w-full" />
      ) : cuisines.length === 0 ? (
        <EmptyState title="No cuisines yet" description="Nothing to combine." />
      ) : (
        <Card className="space-y-3">
          <SectionHeading>Pick a keeper, then what merges into it</SectionHeading>

          <ul className="divide-line divide-y">
            {cuisines.map((c) => (
              <li
                key={c.slug}
                className="flex items-center gap-3 py-2 text-sm"
              >
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="keep-cuisine"
                    checked={keep === c.slug}
                    onChange={() => setKeepSlug(c.slug)}
                  />
                  Keep
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    disabled={!keep || keep === c.slug}
                    checked={mergeSet.has(c.slug)}
                    onChange={() => toggleMerge(c.slug)}
                  />
                  Merge in
                </label>
                <span className="text-ink min-w-0 flex-1 truncate">
                  {formatCuisine(c.slug)}
                </span>
                <span className="text-stone shrink-0 font-mono text-xs">
                  {c.slug}
                </span>
              </li>
            ))}
          </ul>

          {preview && (
            <div className="border-line space-y-2 rounded-xl border p-3 text-xs">
              {preview.map((p) => (
                <div key={p.slug}>
                  <p className="text-ink font-medium">
                    {p.slug === keep ? "Keeping: " : "Moving from: "}
                    {formatCuisine(p.slug)}
                  </p>
                  <p className="text-stone">
                    {p.place_count} place{p.place_count === 1 ? "" : "s"} ·{" "}
                    {p.profile_count} taste preference
                    {p.profile_count === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !keep || mergeSet.size === 0}
              onClick={runPreview}
            >
              Preview
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy || !keep || mergeSet.size === 0 || !preview}
              onClick={runMerge}
            >
              {busy ? "Merging…" : "Confirm merge"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
