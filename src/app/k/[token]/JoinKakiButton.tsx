"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote } from "@/components/ui";
import { mutateJson } from "@/lib/fetcher";

export default function JoinKakiButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = await mutateJson<{ kaki: { id: string } }>(
        "/api/kakis",
        "POST",
        { join_token: token }
      );
      router.push(`/kakis/${payload.kaki.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={join} disabled={busy}>
        {busy ? "Joining…" : "Join the group"}
      </Button>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
