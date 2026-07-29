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
  Stars,
  inputClass,
} from "@/components/ui";
import { UserMetricsCharts } from "@/components/MetricsCharts";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { config, features } from "@/lib/config";
import { BUDGET_TIERS, CUISINES } from "@/lib/constants";
import { formatCuisine, formatDate, formatMonthKey, groupBy } from "@/lib/utils";
import type {
  AuthUser,
  BudgetTier,
  Office,
  UserMetrics,
  UserPrefs,
  Visit,
  WishlistEntry,
} from "@/types";

export default function ProfilePage() {
  const router = useRouter();

  const { data: me } = useSWR<{ user: AuthUser | null }>("/api/me", fetcher);
  const { data: metricsData } = useSWR<{ user: UserMetrics }>(
    features.metrics ? "/api/metrics" : null,
    fetcher
  );
  const { data: visitsData } = useSWR<{ visits: Visit[] }>(
    "/api/visits",
    fetcher
  );
  const { data: prefsData, mutate: mutatePrefs } = useSWR<{
    prefs: UserPrefs | null;
  }>("/api/user-prefs", fetcher);
  const { data: wishlistData } = useSWR<{ wishlist: WishlistEntry[] }>(
    features.wishlist ? "/api/wishlist" : null,
    fetcher
  );
  const { data: officeData } = useSWR<{ offices: Office[] }>(
    "/api/offices",
    fetcher
  );

  const [name, setName] = useState("");
  const [likes, setLikes] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [budgetMin, setBudgetMin] = useState<BudgetTier>(1);
  const [budgetMax, setBudgetMax] = useState<BudgetTier>(4);
  const [officeId, setOfficeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me?.user?.display_name) setName(me.user.display_name);
  }, [me]);

  useEffect(() => {
    const prefs = prefsData?.prefs;
    if (!prefs) return;
    setLikes(prefs.cuisine_likes ?? []);
    setDislikes(prefs.cuisine_dislikes ?? []);
    setBudgetMin((prefs.budget_min ?? 1) as BudgetTier);
    setBudgetMax((prefs.budget_max ?? 4) as BudgetTier);
    setOfficeId(prefs.default_office_id ?? "");
  }, [prefsData]);

  const toggle = (
    value: string,
    list: string[],
    setter: (next: string[]) => void,
    other: string[],
    otherSetter: (next: string[]) => void
  ) => {
    if (list.includes(value)) {
      setter(list.filter((v) => v !== value));
      return;
    }
    // Liking something you had marked as disliked should clear the dislike,
    // rather than leaving the recommender with contradictory instructions.
    if (other.includes(value)) otherSetter(other.filter((v) => v !== value));
    setter([...list, value]);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      await Promise.all([
        mutateJson("/api/profile", "PUT", { display_name: name.trim() }),
        mutateJson("/api/user-prefs", "PUT", {
          cuisine_likes: likes,
          cuisine_dislikes: dislikes,
          budget_min: budgetMin,
          budget_max: budgetMax,
          default_office_id: officeId || null,
        }),
      ]);
      mutatePrefs();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const visits = visitsData?.visits ?? [];
  const byMonth = groupBy(visits, (v) => v.visited_at.slice(0, 7));
  const months = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">You</h1>
        <p className="text-dolch-muted mt-1 text-sm">
          {me?.user?.email ?? "Signed in"}
        </p>
      </header>

      <Card className="space-y-4">
        <SectionHeading>Profile</SectionHeading>

        <Field
          label="Display name"
          hint="What teammates see next to your votes and reviews."
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Your name"
          />
        </Field>

        {features.offices && officeData?.offices && (
          <Field label="Office" hint="Walking times are measured from here.">
            <select
              value={officeId}
              onChange={(e) => setOfficeId(e.target.value)}
              className={inputClass}
            >
              <option value="">Default</option>
              {officeData.offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Card>

      <Card className="space-y-4">
        <SectionHeading>Taste</SectionHeading>
        <p className="text-dolch-muted text-xs">
          Jio learns from what you rate, but these give it a head start.
          Anything you dislike across the board gets excluded entirely.
        </p>

        <div>
          <p className="text-dolch-text mb-2 text-sm font-medium">Like</p>
          <div className="flex flex-wrap gap-1.5">
            {CUISINES.map((c) => (
              <Chip
                key={c}
                active={likes.includes(c)}
                onClick={() =>
                  toggle(c, likes, setLikes, dislikes, setDislikes)
                }
              >
                {formatCuisine(c)}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-dolch-text mb-2 text-sm font-medium">
            Rather not
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CUISINES.map((c) => (
              <Chip
                key={c}
                active={dislikes.includes(c)}
                onClick={() =>
                  toggle(c, dislikes, setDislikes, likes, setLikes)
                }
              >
                {formatCuisine(c)}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cheapest">
            <select
              value={budgetMin}
              onChange={(e) => setBudgetMin(Number(e.target.value) as BudgetTier)}
              className={inputClass}
            >
              {BUDGET_TIERS.map((t) => (
                <option key={t.tier} value={t.tier}>
                  {t.label} ({t.description})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priciest">
            <select
              value={budgetMax}
              onChange={(e) => setBudgetMax(Number(e.target.value) as BudgetTier)}
              className={inputClass}
            >
              {BUDGET_TIERS.map((t) => (
                <option key={t.tier} value={t.tier}>
                  {t.label} ({t.description})
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {saved && (
          <span className="text-dolch-success text-sm" role="status">
            Saved
          </span>
        )}
      </div>

      {features.metrics && metricsData?.user && (
        <section>
          <SectionHeading>Your numbers</SectionHeading>
          <UserMetricsCharts metrics={metricsData.user} />
        </section>
      )}

      {features.wishlist &&
        wishlistData?.wishlist &&
        wishlistData.wishlist.length > 0 && (
          <section>
            <SectionHeading>Want to try</SectionHeading>
            <ul className="space-y-1.5">
              {wishlistData.wishlist.map((entry) => (
                <li key={entry.place_id}>
                  <Link
                    href={`/places/${entry.place_id}`}
                    className="border-dolch-border bg-dolch-surface/60 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="truncate">
                      {entry.place?.name ?? "A place"}
                    </span>
                    {typeof entry.place?.walk_minutes === "number" && (
                      <span className="text-dolch-muted shrink-0 text-xs">
                        {entry.place.walk_minutes} min
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

      {visits.length > 0 && (
        <section>
          <SectionHeading>History</SectionHeading>
          <div className="space-y-4">
            {months.slice(0, 6).map((month) => (
              <div key={month}>
                <p className="text-dolch-muted mb-1.5 text-xs font-medium">
                  {formatMonthKey(month)}
                </p>
                <ul className="space-y-1">
                  {(byMonth.get(month) ?? []).map((visit) => (
                    <li
                      key={visit.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <Link
                        href={`/places/${visit.place_id}`}
                        className="truncate hover:underline"
                      >
                        {visit.place_name ?? "A place"}
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        <Stars rating={visit.rating} />
                        <span className="text-dolch-muted text-xs">
                          {formatDate(visit.visited_at)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <Card className="space-y-3">
        <SectionHeading>Account</SectionHeading>
        {features.kakis && (
          <Link href="/kakis" className="text-dolch-accent block text-sm underline">
            Your kaki groups
          </Link>
        )}
        <p className="text-dolch-muted text-xs">
          Push notifications are not built yet — see the README for what would
          be involved.
        </p>
        {!config.isDemo && (
          <Button variant="secondary" onClick={signOut}>
            Sign out
          </Button>
        )}
      </Card>
    </div>
  );
}
