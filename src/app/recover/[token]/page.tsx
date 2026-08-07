"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { mutateJson } from "@/lib/fetcher";

type Status = "working" | "done" | "error";

/**
 * Redeems a personal recovery link on load — CHANGES_20260807.md §4's
 * collision-safe counterpart to name-based claim. No sign-in gate here on
 * purpose: reaching this page with no session at all is the normal case,
 * not an error.
 */
export default function RecoverPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    mutateJson("/api/recover", "POST", { token: params.token })
      .then(() => {
        if (cancelled) return;
        setStatus("done");
        setTimeout(() => {
          if (!cancelled) router.replace("/");
        }, 1500);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not recover that account");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-sm space-y-3 text-center">
        {status === "working" && (
          <>
            <p className="text-ink text-sm font-medium">Signing you back in…</p>
            <p className="text-stone text-xs">One moment.</p>
          </>
        )}
        {status === "done" && (
          <>
            <p className="text-ink text-sm font-medium">You're back in.</p>
            <p className="text-stone text-xs">Taking you home…</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-ink text-sm font-medium">That didn't work.</p>
            <p className="text-stone text-xs">{error}</p>
            <Button size="sm" onClick={() => router.replace("/")}>
              Go home
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
