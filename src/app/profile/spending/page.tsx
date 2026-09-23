"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  Field,
  SectionHeading,
  SkeletonDetail,
  inputClass,
} from "@/components/ui";
import BudgetTierInsights, {
  emptyMetrics,
} from "@/components/profile/BudgetTierInsights";
import { fetcher, mutateJson } from "@/lib/fetcher";
import {
  currentMonthKey,
  formatCents,
  nextMonthKey,
  previousMonthKey,
} from "@/lib/expenses";
import { formatDate, formatMonthKey } from "@/lib/utils";
import type {
  ExpenseCategory,
  ExpenseEntry,
  ExpenseMonthSummary,
  Place,
  UserMetrics,
} from "@/types";

type Tab = "insights" | "tracker";

const PAGE_SIZE = 20;

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "coffee", label: "Coffee" },
  { value: "snack", label: "Snack" },
  { value: "other", label: "Other" },
];

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  coffee: "Coffee",
  snack: "Snack",
  other: "Other",
};

interface ExpensesResponse {
  summary: ExpenseMonthSummary;
  entries: ExpenseEntry[];
  page: number;
  pageSize: number;
  totalCount: number;
}

/** Shared amount/label/category fields — used both by the quick-add sheet
 *  (a new entry) and a row's inline edit (an existing one). Only the save
 *  button's label and what happens on submit differ between the two.
 *
 * "What was it?" doubles as a place search — same optional
 * search-with-freeform-fallback shape as the Kaki wishlist's own
 * search-to-add, over the same `/api/places?q=` every other search box in
 * the app already uses. A match is opportunistic, never required: picking
 * a suggestion links `placeId` (and fills the label with the place's own
 * name); typing straight past the dropdown, or editing after a pick, just
 * saves whatever text is there as a plain label with no place attached. */
function EntryFields({
  amount,
  setAmount,
  label,
  setLabel,
  placeId,
  setPlaceId,
  category,
  setCategory,
}: {
  amount: string;
  setAmount: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
  placeId: string | null;
  setPlaceId: (v: string | null) => void;
  category: ExpenseCategory;
  setCategory: (v: ExpenseCategory) => void;
}) {
  const trimmedLabel = label.trim();
  const { data: searchData } = useSWR<{ places: Place[] }>(
    !placeId && trimmedLabel.length >= 2
      ? `/api/places?q=${encodeURIComponent(trimmedLabel)}`
      : null,
    fetcher
  );
  const results = searchData?.places ?? [];

  const pickPlace = (place: Place) => {
    setLabel(place.name);
    setPlaceId(place.id);
  };

  return (
    <>
      <Field label="Amount">
        <div className="relative">
          <span className="text-stone pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
            $
          </span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} pl-6`}
            placeholder="12.50"
            autoFocus
          />
        </div>
      </Field>
      <Field label="What was it?">
        <input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            // Editing past a pick means it's custom text again — a stale
            // link to whatever was matched before would silently attach
            // the wrong place to whatever gets typed next.
            if (placeId) setPlaceId(null);
          }}
          className={inputClass}
          placeholder="Yakun kaya toast"
        />
        {placeId ? (
          <p className="text-sage mt-1 text-xs">Matched to a place.</p>
        ) : (
          results.length > 0 && (
            <div className="border-line bg-frost mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded-lg border p-1">
              {results.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => pickPlace(place)}
                  className="hover:bg-cream w-full truncate rounded-md px-2 py-1.5 text-left text-sm"
                >
                  {place.name}
                </button>
              ))}
            </div>
          )
        )}
      </Field>
      <Field label="Kind">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <Chip
              key={c.value}
              active={category === c.value}
              onClick={() => setCategory(c.value)}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </Field>
    </>
  );
}

function QuickAddSheet({
  onClose,
  onLogged,
}: {
  onClose: () => void;
  onLogged: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [category, setCategory] = useState<ExpenseCategory>("lunch");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Chained "log another" — the lunch-then-coffee pattern. Shown right
  // after a successful save instead of the fields, one tap either way.
  const [justLogged, setJustLogged] = useState(false);

  const reset = () => {
    setAmount("");
    setLabel("");
    setPlaceId(null);
    setCategory("lunch");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedAmount = amount.trim();
    const amountCents = trimmedAmount ? Math.round(parseFloat(trimmedAmount) * 100) : 0;
    if (!amountCents || amountCents <= 0) {
      setError("Put in an amount");
      return;
    }
    if (!label.trim()) {
      setError("What was it for?");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await mutateJson("/api/expenses", "POST", {
        amount_cents: amountCents,
        label: label.trim(),
        place_id: placeId,
        category,
      });
      onLogged();
      reset();
      setJustLogged(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that");
    } finally {
      setBusy(false);
    }
  };

  if (justLogged) {
    return (
      <Card className="animate-fade-in space-y-3">
        <p className="text-sm font-medium">Logged.</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setJustLogged(false)}>
            Log another
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Log spending</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-stone text-xs underline"
        >
          Cancel
        </button>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <EntryFields
          amount={amount}
          setAmount={setAmount}
          label={label}
          setLabel={setLabel}
          placeId={placeId}
          setPlaceId={setPlaceId}
          category={category}
          setCategory={setCategory}
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </form>
    </Card>
  );
}

function EntryRow({
  entry,
  onSaved,
  onDeleted,
}: {
  entry: ExpenseEntry;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState((entry.amount_cents / 100).toFixed(2));
  const [label, setLabel] = useState(entry.label);
  const [placeId, setPlaceId] = useState<string | null>(entry.place_id ?? null);
  const [category, setCategory] = useState<ExpenseCategory>(entry.category);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setAmount((entry.amount_cents / 100).toFixed(2));
    setLabel(entry.label);
    setPlaceId(entry.place_id ?? null);
    setCategory(entry.category);
    setError(null);
    setEditing(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedAmount = amount.trim();
    const amountCents = trimmedAmount ? Math.round(parseFloat(trimmedAmount) * 100) : 0;
    if (!amountCents || amountCents <= 0) {
      setError("Put in an amount");
      return;
    }
    if (!label.trim()) {
      setError("What was it for?");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await mutateJson(`/api/expenses/${entry.id}`, "PATCH", {
        amount_cents: amountCents,
        label: label.trim(),
        place_id: placeId,
        category,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await mutateJson(`/api/expenses/${entry.id}`, "DELETE");
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that");
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <li className="border-line rounded-xl border p-3">
        <form onSubmit={save} className="space-y-3">
          <EntryFields
            amount={amount}
            setAmount={setAmount}
            label={label}
            setLabel={setLabel}
            placeId={placeId}
            setPlaceId={setPlaceId}
            category={category}
            setCategory={setCategory}
          />
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="border-line rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entry.label}</p>
          <p className="text-stone text-xs">
            {formatDate(entry.logged_at)} · {CATEGORY_LABEL[entry.category]}
            {entry.source_visit_id && " · From a review"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm font-semibold tabular-nums">
            {formatCents(entry.amount_cents)}
          </span>
          <button
            type="button"
            onClick={startEdit}
            disabled={busy}
            className="text-stone hover:text-ink text-xs underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-stone hover:text-ember text-xs underline"
          >
            Remove
          </button>
        </div>
      </div>
      {error && (
        <p className="text-ember mt-2 text-xs">{error}</p>
      )}
    </li>
  );
}

function SummaryCard({ summary }: { summary: ExpenseMonthSummary }) {
  const total = Object.values(summary.byCategory).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...Object.values(summary.byCategory));

  return (
    <Card className="space-y-3">
      <div>
        <p className="text-ink text-2xl font-semibold tabular-nums">
          {formatCents(summary.totalCents)}
        </p>
        {summary.deltaVsPreviousMonthPct !== null && (
          <p className="text-stone text-xs">
            {summary.deltaVsPreviousMonthPct >= 0 ? "Up" : "Down"}{" "}
            {Math.abs(summary.deltaVsPreviousMonthPct)}% vs. last month
          </p>
        )}
      </div>

      {total > 0 && (
        <ul className="space-y-2">
          {CATEGORIES.map((c) => {
            const cents = summary.byCategory[c.value] ?? 0;
            if (cents === 0) return null;
            return (
              <li key={c.value} className="flex items-center gap-3 text-xs">
                <span className="text-stone w-14 shrink-0">{c.label}</span>
                <span className="bg-paper h-3 flex-1 overflow-hidden rounded-full">
                  <span
                    className="bg-ember block h-full rounded-full"
                    style={{ width: `${Math.max(3, (cents / max) * 100)}%` }}
                  />
                </span>
                <span className="text-stone w-16 shrink-0 text-right tabular-nums">
                  {formatCents(cents)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {summary.comparisonNote && (
        <p className="text-stone text-xs">{summary.comparisonNote}</p>
      )}
    </Card>
  );
}

function SpendingPageInner() {
  // Insights first, on open — a budget-tier breakdown that needs nothing
  // logged, so most people (who will never manually track a dollar
  // amount) still land on something useful rather than an empty ledger.
  // The personal $ tracker is a second, opt-in tab, not the default —
  // except for someone who already uses it: the "Usual spend" tile on the
  // profile page links straight in with `?tab=tracker` once it knows
  // real entries exist, so an established tracker isn't demoted behind an
  // extra tap every time.
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(
    searchParams.get("tab") === "tracker" ? "tracker" : "insights"
  );
  const [month, setMonth] = useState(currentMonthKey());
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);

  const { data: metricsData, isLoading: metricsLoading } = useSWR<{
    user: UserMetrics;
  }>(tab === "insights" ? "/api/metrics" : null, fetcher);

  const { data, mutate, isLoading } = useSWR<ExpensesResponse>(
    tab === "tracker" ? `/api/expenses?month=${month}&page=${page}` : null,
    fetcher
  );

  const isCurrentMonth = month === currentMonthKey();
  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE)) : 1;

  const changeMonth = (direction: -1 | 1) => {
    setMonth((m) => (direction === -1 ? previousMonthKey(m) : nextMonthKey(m)));
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <Link href="/profile" className="text-ember text-sm underline">
        ← Back to You
      </Link>

      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Spending</h1>
        {tab === "tracker" && !showAdd && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            + Add
          </Button>
        )}
      </header>

      <div className="border-line flex gap-1 rounded-full border p-1 text-sm">
        <button
          type="button"
          onClick={() => setTab("insights")}
          aria-pressed={tab === "insights"}
          className={
            "flex-1 rounded-full px-3 py-1.5 transition-colors " +
            (tab === "insights"
              ? "bg-ember font-medium text-white"
              : "text-stone hover:text-ink")
          }
        >
          Insights
        </button>
        <button
          type="button"
          onClick={() => setTab("tracker")}
          aria-pressed={tab === "tracker"}
          className={
            "flex-1 rounded-full px-3 py-1.5 transition-colors " +
            (tab === "tracker"
              ? "bg-ember font-medium text-white"
              : "text-stone hover:text-ink")
          }
        >
          My tracker
        </button>
      </div>

      {tab === "insights" ? (
        metricsLoading ? (
          <SkeletonDetail />
        ) : (
          <BudgetTierInsights metrics={metricsData?.user ?? emptyMetrics()} />
        )
      ) : (
        <>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="Previous month"
              className="tap-target-text text-stone hover:text-ink text-lg"
            >
              &lsaquo;
            </button>
            <span className="text-sm font-medium">{formatMonthKey(month)}</span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              disabled={isCurrentMonth}
              aria-label="Next month"
              className="tap-target-text text-stone hover:text-ink text-lg disabled:opacity-30"
            >
              &rsaquo;
            </button>
          </div>

          {showAdd && (
            <QuickAddSheet
              onClose={() => setShowAdd(false)}
              onLogged={() => mutate()}
            />
          )}

          {data?.summary && <SummaryCard summary={data.summary} />}

          <section>
            <SectionHeading>Entries</SectionHeading>
            {isLoading ? null : (data?.entries.length ?? 0) === 0 ? (
              <EmptyState
                title="Nothing logged this month"
                description="Add your first entry above."
              />
            ) : (
              <ul className="space-y-2">
                {data!.entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    onSaved={() => mutate()}
                    onDeleted={() => mutate()}
                  />
                ))}
              </ul>
            )}

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-center gap-1.5">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    aria-current={n === page}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                      n === page
                        ? "bg-ember text-white"
                        : "text-stone hover:bg-cream"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function SpendingPage() {
  return (
    <Suspense fallback={<SkeletonDetail />}>
      <SpendingPageInner />
    </Suspense>
  );
}
