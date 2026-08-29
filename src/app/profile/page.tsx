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
import FoodIdentityCard from "@/components/profile/FoodIdentityCard";
import PastJios from "@/components/profile/PastJios";
import LobangInbox from "@/components/profile/LobangInbox";
import AttachEmailPanel from "@/components/profile/AttachEmailPanel";
import MyFlagsList from "@/components/profile/MyFlagsList";
import PushNotificationToggle from "@/components/profile/PushNotificationToggle";
import HapticsToggle from "@/components/profile/HapticsToggle";
import ReminderSettingsPanel from "@/components/profile/ReminderSettingsPanel";
import AddToHomeScreenCard from "@/components/profile/AddToHomeScreenCard";
import RecoveryLinkPanel from "@/components/profile/RecoveryLinkPanel";
import PersonalInvitePanel, {
  usePersonalInviteLink,
} from "@/components/profile/PersonalInvitePanel";
import QrShortcutButton from "@/components/profile/QrShortcutButton";
import HintCard from "@/components/HintCard";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { config, features } from "@/lib/config";
import { BUDGET_TIERS } from "@/lib/constants";
import {
  cycleCuisinePreference,
  formatCuisine,
  formatDate,
  formatMonthKey,
  groupBy,
} from "@/lib/utils";
import type {
  AuthUser,
  BudgetTier,
  CuisineOption,
  Office,
  UserFoodIdentitySnapshot,
  UserMetrics,
  UserPrefs,
  Visit,
  WishlistEntry,
} from "@/types";

/**
 * Small-caps eyebrow marking where one of the three zones below starts —
 * CHANGES_20260816.md §3. Not `SectionHeading`: that's for a sub-section
 * title ("Profile," "Your numbers"), this is one level up, grouping several
 * of those under one named zone. Kept local rather than added to `ui.tsx`
 * since nothing else needs it yet — same "no new components" approach as
 * the place page's button tiering.
 */
function ZoneLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-stone text-xs font-semibold tracking-wide uppercase">
      {children}
    </p>
  );
}

export default function ProfilePage() {
  const router = useRouter();

  const { data: me, mutate: mutateMe } = useSWR<{
    user: (AuthUser & { is_admin: boolean }) | null;
  }>("/api/me", fetcher);
  const [emailAttached, setEmailAttached] = useState(false);
  const { data: metricsData } = useSWR<{
    user: UserMetrics;
    foodIdentity: UserFoodIdentitySnapshot | null;
  }>(features.metrics ? "/api/metrics" : null, fetcher);
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
  const { data: cuisinesData } = useSWR<{ cuisines: CuisineOption[] }>(
    "/api/cuisines",
    fetcher
  );

  const [name, setName] = useState("");
  const [likes, setLikes] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [budgetMin, setBudgetMin] = useState<BudgetTier>(1);
  const [budgetMax, setBudgetMax] = useState<BudgetTier>(6);
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
    setBudgetMax((prefs.budget_max ?? 6) as BudgetTier);
    setOfficeId(prefs.default_office_id ?? "");
  }, [prefsData]);

  const cycleCuisine = (cuisine: string) => {
    const next = cycleCuisinePreference(cuisine, likes, dislikes);
    setLikes(next.likes);
    setDislikes(next.dislikes);
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

  const personalInvite = usePersonalInviteLink();

  const visits = visitsData?.visits ?? [];
  const byMonth = groupBy(visits, (v) => v.visited_at.slice(0, 7));
  const months = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));

  const hasActivity =
    (features.metrics && !!metricsData?.user) ||
    (features.wishlist && (wishlistData?.wishlist.length ?? 0) > 0) ||
    visits.length > 0 ||
    (features.events && !!me?.user?.id) ||
    (features.lobangs && !!me?.user?.id) ||
    !!me?.user?.id;

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">You</h1>
          <p className="text-stone mt-1 text-sm">
            {/* Name-only users have no email, so fall back to who they said
                they are rather than showing an empty line. */}
            {me?.user?.email ?? me?.user?.display_name ?? "Signed in"}
          </p>
        </div>
        <QrShortcutButton {...personalInvite} />
      </header>

      <HintCard page="you" icon="📱">
        Tap the scan icon above to share your invite in person, and set your
        Taste preferences below so picks fit you better.
      </HintCard>

      {/* Zone 1 — Settings: everything you edit, one card, one Save. */}
      <div className="space-y-3">
        <ZoneLabel>Settings</ZoneLabel>
        <Card className="space-y-5">
          <div className="space-y-4">
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
          </div>

          <div className="border-line space-y-4 border-t pt-5">
            <SectionHeading>Taste</SectionHeading>
            <p className="text-stone text-xs">
              Jio learns from what you rate, but these give it a head start.
              Anything you dislike across the board gets excluded entirely.
              Tap a cuisine to cycle through neutral, like and dislike.
            </p>

            <div>
              <div className="text-stone mb-2 flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className="bg-sage-tint h-2.5 w-2.5 rounded-full" />
                  Like
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="bg-ember-tint h-2.5 w-2.5 rounded-full" />
                  Dislike
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(cuisinesData?.cuisines ?? []).map((c) => {
                  const tone = likes.includes(c.slug)
                    ? ("like" as const)
                    : dislikes.includes(c.slug)
                      ? ("dislike" as const)
                      : undefined;
                  const label = formatCuisine(c.slug);
                  return (
                    <Chip
                      key={c.slug}
                      active={!!tone}
                      tone={tone}
                      onClick={() => cycleCuisine(c.slug)}
                      // UX review log #3 — this cycles through three
                      // states (neutral/like/dislike), so `aria-pressed`
                      // (a true two-state idea) doesn't fit. Stating the
                      // value directly in the name is the fix instead.
                      ariaLabel={
                        tone === "like"
                          ? `${label}, liked`
                          : tone === "dislike"
                            ? `${label}, disliked`
                            : label
                      }
                    >
                      {label}
                    </Chip>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Cheapest">
                <select
                  value={budgetMin}
                  onChange={(e) =>
                    setBudgetMin(Number(e.target.value) as BudgetTier)
                  }
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
                  onChange={(e) =>
                    setBudgetMax(Number(e.target.value) as BudgetTier)
                  }
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
          </div>

          <div className="border-line space-y-3 border-t pt-4">
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
              {saved && (
                <span className="text-sage text-sm" role="status">
                  Saved
                </span>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Zone 2 — Your activity: everything you browse, read-only. Each
          section keeps exactly the container style it already had (bare
          SectionHeading, no card) — only the zone label is new. */}
      {hasActivity && (
        <div className="space-y-5">
          <ZoneLabel>Your activity</ZoneLabel>

          {features.metrics && metricsData?.user && (
            <section className="space-y-3">
              <SectionHeading>Your numbers</SectionHeading>
              {metricsData.user.totalVisits > 0 && (
                <FoodIdentityCard snapshot={metricsData.foodIdentity ?? null} />
              )}
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
                        className="border-line bg-cream/60 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                      >
                        <span className="truncate">
                          {entry.place?.name ?? "A place"}
                        </span>
                        {typeof entry.place?.walk_minutes === "number" && (
                          <span className="text-stone shrink-0 text-xs">
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
                    <p className="text-stone mb-1.5 text-xs font-medium">
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
                            <span className="text-stone text-xs">
                              {formatDate(visit.visited_at)}
                            </span>
                            {/* CHANGES_20260818.md §1 — the only place a
                                private (not shared) visit is reachable at
                                all, so this is the one entry point that
                                actually covers every review, not just
                                shared ones. Reuses the place page's own
                                "How was it?" form rather than building a
                                second copy — the query param tells that
                                page which visit to pre-fill and PATCH. */}
                            <Link
                              href={`/places/${visit.place_id}?editVisit=${visit.id}`}
                              className="text-ember text-xs underline"
                            >
                              Edit
                            </Link>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {features.events && me?.user?.id && (
            <PastJios selfId={me.user.id} />
          )}

          {features.lobangs && me?.user?.id && <LobangInbox />}

          {me?.user?.id && <MyFlagsList />}
        </div>
      )}

      {/* Zone 3 — Account: personal settings, admin tools (visually
          separated, admins only), then sign out standing alone. */}
      <div className="space-y-3">
        <ZoneLabel>Account</ZoneLabel>

        <Card className="divide-line divide-y">
          {features.kakis && (
            <div className="py-3 first:pt-0 last:pb-0">
              <Link href="/kakis" className="text-ember block text-sm underline">
                Your kaki groups
              </Link>
            </div>
          )}

          <div className="py-3 first:pt-0 last:pb-0">
            <AddToHomeScreenCard />
          </div>

          <div className="py-3 first:pt-0 last:pb-0">
            <PushNotificationToggle />
          </div>

          <div className="py-3 first:pt-0 last:pb-0">
            <HapticsToggle />
          </div>

          {features.events && (
            <div className="py-3 first:pt-0 last:pb-0">
              <ReminderSettingsPanel />
            </div>
          )}

          <div className="py-3 first:pt-0 last:pb-0">
            <PersonalInvitePanel {...personalInvite} />
          </div>

          {config.authAdapter === "name" && !config.isDemo && (
            <div className="py-3 first:pt-0 last:pb-0">
              <RecoveryLinkPanel />
            </div>
          )}

          {config.authAdapter === "name" &&
            !config.isDemo &&
            (emailAttached ? (
              <div className="py-3 first:pt-0 last:pb-0">
                <p className="text-sage text-sm">
                  Email attached — you can sign back in from any device.
                </p>
              </div>
            ) : me?.user && !me.user.email ? (
              <div className="py-3 first:pt-0 last:pb-0">
                <AttachEmailPanel
                  onAttached={() => {
                    setEmailAttached(true);
                    mutateMe();
                  }}
                />
              </div>
            ) : null)}
        </Card>

        {me?.user?.is_admin && (
          <div className="border-line space-y-2 rounded-2xl border border-dashed p-4">
            <p className="text-stone text-xs font-semibold tracking-wide uppercase">
              Admin tools
            </p>
            <div className="space-y-1.5">
              <Link
                href="/admin/moderation"
                className="text-ember block text-sm underline"
              >
                Moderation
              </Link>
              <Link
                href="/admin/analytics"
                className="text-ember block text-sm underline"
              >
                Analytics
              </Link>
              <Link
                href="/admin/accounts"
                className="text-ember block text-sm underline"
              >
                Accounts
              </Link>
              <Link
                href="/admin/cuisines"
                className="text-ember block text-sm underline"
              >
                Cuisines
              </Link>
              {features.offices && (
                <Link
                  href="/admin/offices"
                  className="text-ember block text-sm underline"
                >
                  Offices
                </Link>
              )}
            </div>
          </div>
        )}

        {/* In name-only mode there is no way back in: the identity lives in
            this browser's session and nothing else. Signing out is closer to
            "delete me" than to "log out", so it says so and is not styled as
            the friendly option. Changing your name is what people actually
            want, and that is the field at the top of this page. Standing
            alone below a divider rather than inside a card — it is already
            the one thing on this page correctly signaled as high-stakes,
            and grouping it with either card above would soften that. */}
        {config.authAdapter === "name" && !config.isDemo && (
          <div className="border-line space-y-3 border-t pt-4">
            <p className="text-stone text-xs">
              You are signed in on this browser only. Signing out gives you a
              blank slate — your ratings, wishlist and history stay with the old
              identity and there is no way back to them.
            </p>
            <Button
              variant="danger"
              onClick={() => {
                if (
                  window.confirm(
                    "Sign out and start fresh? Your history on this browser will not be recoverable."
                  )
                ) {
                  signOut();
                }
              }}
            >
              Sign out and start over
            </Button>
          </div>
        )}

        {config.authAdapter === "email" && (
          <div className="border-line border-t pt-4">
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
