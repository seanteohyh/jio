"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button, Card, ErrorNote, Field, inputClass } from "@/components/ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { DEFAULT_OFFICE } from "@/lib/constants";
import type { AuthUser } from "@/types";

interface MeResponse {
  user: (AuthUser & { display_name: string }) | null;
}

/**
 * One-time welcome screen for a new user (`profiles.onboarded_at` still
 * null). Deliberately a single field, not a wizard — cuisine/budget prefs
 * stay on /profile where they already live. In `name` mode the display name
 * was already typed at sign-in, so this just prefills and lets it be
 * confirmed or tweaked rather than asking twice.
 *
 * Office is a locked field, not a picker — only one office is functionally
 * usable right now despite the schema supporting more.
 */
export default function WelcomePage() {
  const router = useRouter();
  const { data, isLoading } = useSWR<MeResponse>("/api/me", fetcher);

  const [name, setName] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!prefilled && data?.user?.display_name) {
      setName(data.user.display_name);
      setPrefilled(true);
    }
  }, [data, prefilled]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await mutateJson("/api/onboarding", "POST", { display_name: name.trim() });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that");
      setBusy(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="mx-auto max-w-sm space-y-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to Jio.
        </h1>
        <p className="text-stone mt-1 text-sm">
          One quick thing before you get to lunch.
        </p>
      </header>

      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="What should people call you?"
            hint="Shows up next to your votes and reviews."
          >
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              maxLength={40}
              autoFocus
            />
          </Field>

          <Field label="Office">
            <input
              value={DEFAULT_OFFICE.name}
              disabled
              className={`${inputClass} cursor-not-allowed opacity-70`}
            />
            <p className="text-stone mt-1 text-xs">
              This pilot only supports one office for now.
            </p>
          </Field>

          {error && <ErrorNote>{error}</ErrorNote>}

          <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
            {busy ? "One moment…" : "Continue"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
