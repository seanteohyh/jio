"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Button,
  Card,
  Chip,
  ErrorNote,
  Field,
  SectionHeading,
  inputClass,
} from "@/components/ui";
import PersonalInvitePanel, {
  usePersonalInviteLink,
} from "@/components/profile/PersonalInvitePanel";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { BUDGET_TIERS, DEFAULT_OFFICE } from "@/lib/constants";
import type { AuthUser, BudgetTier } from "@/types";

interface MeResponse {
  user: (AuthUser & { display_name: string }) | null;
}

/**
 * CHANGES_20260821_combined2.md §3B — a curated handful, not the full
 * admin-managed cuisines list `/profile`'s own Taste section shows (that's
 * a "tap to cycle like/dislike across everything you know" tool; this is a
 * two-tap head start, so a shorter, fixed list avoids both an extra
 * `/api/cuisines` round-trip on the very first screen someone sees and any
 * dependency on the admin-editable table's current contents).
 */
const WELCOME_CUISINES: { slug: string; label: string }[] = [
  { slug: "chinese", label: "Chinese" },
  { slug: "malay", label: "Malay" },
  { slug: "indian", label: "Indian" },
  { slug: "japanese", label: "Japanese" },
  { slug: "korean", label: "Korean" },
  { slug: "thai", label: "Thai" },
  { slug: "western", label: "Western" },
  { slug: "local", label: "Local" },
];

/**
 * One-time welcome screen for a new user (`profiles.onboarded_at` still
 * null). Deliberately a single required field (name), not a wizard — full
 * cuisine/budget prefs stay on /profile where they already live. In `name`
 * mode the display name was already typed at sign-in, so this just
 * prefills and lets it be confirmed or tweaked rather than asking twice.
 *
 * Office is a locked field, not a picker — only one office is functionally
 * usable right now despite the schema supporting more.
 *
 * CHANGES_20260821_combined2.md §2/§3B added the three blocks below the
 * name/office form: a taste-preference bootstrap (so a first-timer's very
 * first /suggest visit isn't running on an empty profile), the person's
 * own personal invite link/QR, and a pointer to /suggest as the no-group
 * option — all optional, all skippable via the one Continue button.
 */
export default function WelcomePage() {
  const router = useRouter();
  const { data, isLoading } = useSWR<MeResponse>("/api/me", fetcher);
  const invite = usePersonalInviteLink();

  const [name, setName] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuisineLikes, setCuisineLikes] = useState<string[]>([]);
  const [budgetTier, setBudgetTier] = useState<BudgetTier | null>(null);

  useEffect(() => {
    if (!prefilled && data?.user?.display_name) {
      setName(data.user.display_name);
      setPrefilled(true);
    }
  }, [data, prefilled]);

  const toggleCuisine = (slug: string) => {
    setCuisineLikes((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await mutateJson("/api/onboarding", "POST", { display_name: name.trim() });
      // Best-effort — a first-timer's whole existence here is optional taps,
      // so a failed prefs save shouldn't block the one thing that matters:
      // getting them onto Home.
      if (cuisineLikes.length > 0 || budgetTier !== null) {
        try {
          await mutateJson("/api/user-prefs", "PUT", {
            cuisine_likes: cuisineLikes,
            ...(budgetTier !== null
              ? { budget_min: budgetTier, budget_max: budgetTier }
              : {}),
          });
        } catch {
          // Ignored — see above.
        }
      }
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

          <div className="border-line space-y-3 border-t pt-4">
            <div>
              <p className="text-ink text-sm font-medium">
                What do you usually eat?
              </p>
              <p className="text-stone text-xs">
                Gives your first suggestions a head start — totally optional.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WELCOME_CUISINES.map((c) => (
                <Chip
                  key={c.slug}
                  active={cuisineLikes.includes(c.slug)}
                  onClick={() => toggleCuisine(c.slug)}
                >
                  {c.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {BUDGET_TIERS.map((t) => (
                <Chip
                  key={t.tier}
                  active={budgetTier === t.tier}
                  onClick={() =>
                    setBudgetTier((prev) => (prev === t.tier ? null : t.tier))
                  }
                >
                  {t.label}
                </Chip>
              ))}
            </div>
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="flex items-center gap-3">
            <Button type="submit" className="flex-1" disabled={busy || !name.trim()}>
              {busy ? "One moment…" : "Continue"}
            </Button>
            {(cuisineLikes.length > 0 || budgetTier !== null) && (
              <button
                type="button"
                onClick={() => {
                  setCuisineLikes([]);
                  setBudgetTier(null);
                }}
                className="text-stone shrink-0 text-xs underline"
              >
                Skip for now
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card>
        <SectionHeading>No group yet?</SectionHeading>
        <p className="text-stone mt-1 text-sm">
          You don't need a Kaki to use Jio — get a lunch suggestion just for
          yourself any time.
        </p>
        <Link href="/suggest" className="text-ember mt-2 inline-block text-sm underline">
          Try /suggest →
        </Link>
      </Card>

      <Card>
        <SectionHeading>Bring your team in</SectionHeading>
        <PersonalInvitePanel {...invite} />
      </Card>
    </div>
  );
}
