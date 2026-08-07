"use client";

import { useState } from "react";
import { Button, ErrorNote } from "@/components/ui";
import ShareLink from "@/components/ShareLink";
import { mutateJson } from "@/lib/fetcher";

/**
 * Self-service half of CHANGES_20260807.md §4's recovery link — generated
 * proactively, while still signed in, rather than after the fact. The
 * admin-issued half (for someone who's already locked out and has nothing
 * saved) lives on /admin/accounts.
 */
export default function RecoveryLinkPanel() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await mutateJson<{ token: string; url: string }>(
        "/api/recovery-link",
        "POST"
      );
      setUrl(result.url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create a recovery link"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-ink text-sm font-medium">Recovery link</p>
          <p className="text-stone text-xs">
            Save this somewhere safe. If you're ever signed out unexpectedly,
            opening it signs you straight back into this account — no name
            typing, no guesswork.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={generate} disabled={busy}>
          {busy ? "…" : url ? "Get a new one" : "Get my link"}
        </Button>
      </div>
      {url && (
        <>
          <ShareLink
            url={url}
            label="Your recovery link"
            shareText="My Jio recovery link — keep this private."
          />
          <p className="text-stone text-xs">
            Getting a new one retires this link — only the newest one works.
          </p>
        </>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
