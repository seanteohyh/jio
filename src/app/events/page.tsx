"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  EmptyState,
  ErrorNote,
  LinkButton,
  SectionHeading,
  SkeletonRows,
} from "@/components/ui";
import { fetcher, mutateJson } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { features } from "@/lib/config";
import EventRow from "@/components/events/EventRow";
import type { AuthUser, Kaki, LunchEvent, RecurringSeries } from "@/types";

const WEEKDAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

const DOT_COLOR: Record<LunchEvent["status"], string> = {
  open: "bg-ember",
  closed: "bg-sage",
  cancelled: "bg-stone",
};

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 6 weeks (42 days), Monday-first, covering the month plus lead/trail days. */
function monthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const firstWeekday = (first.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function MonthCalendar({
  cursor,
  onCursorChange,
  events,
  selectedDay,
  onSelectDay,
}: {
  cursor: Date;
  onCursorChange: (d: Date) => void;
  events: LunchEvent[];
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
}) {
  const days = useMemo(() => monthGrid(cursor), [cursor]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, LunchEvent[]>();
    for (const e of events) {
      if (e.date_phase === "polling") continue;
      const key = new Date(e.scheduled_at).toDateString();
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const today = new Date();
  const monthLabel = cursor.toLocaleDateString("en-SG", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            onCursorChange(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
          }
          aria-label="Previous month"
          className="text-stone hover:text-ink min-h-9 min-w-9 rounded-lg text-lg"
        >
          ‹
        </button>
        <p className="font-display text-sm font-semibold">{monthLabel}</p>
        <button
          type="button"
          onClick={() =>
            onCursorChange(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
          }
          aria-label="Next month"
          className="text-stone hover:text-ink min-h-9 min-w-9 rounded-lg text-lg"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i} className="text-stone text-[10px] font-medium">
            {label}
          </span>
        ))}
        {days.map((day) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
          const selected = isSameDay(day, selectedDay);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDay(day)}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-xs transition-colors",
                !inMonth && "opacity-30",
                selected
                  ? "bg-ember text-white"
                  : isSameDay(day, today)
                    ? "border-ember text-ink border"
                    : "text-ink hover:bg-cream"
              )}
            >
              <span>{day.getDate()}</span>
              <span className="flex h-1.5 gap-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <span
                    key={e.id}
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      selected ? "bg-white" : DOT_COLOR[e.status]
                    )}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Filter = "all" | "hosting" | "invited" | "past";
type View = "calendar" | "list";

/**
 * The calendar/browse surface — CHANGES_20260801.md §10. Home dropped its
 * own upcoming-lunches list in favour of this being the one place with a
 * proper forward *and* backward view, rather than both tabs carrying a
 * near-identical list.
 */
export default function EventsPage() {
  const { data, error, isLoading } = useSWR<{ events: LunchEvent[] }>(
    "/api/events",
    fetcher
  );
  const { data: meData } = useSWR<{ user: AuthUser | null }>(
    "/api/me",
    fetcher
  );
  const { data: kakisData } = useSWR<{ kakis: Kaki[] }>(
    features.kakis ? "/api/kakis" : null,
    fetcher
  );
  const { data: seriesData, mutate: mutateSeries } = useSWR<{
    series: RecurringSeries[];
  }>("/api/recurring-series", fetcher);
  const activeSeries = (seriesData?.series ?? []).filter(
    (s) => s.status === "active"
  );

  const cancelSeries = async (id: string) => {
    if (!window.confirm("Stop this recurring Jio? It won't generate again.")) {
      return;
    }
    await mutateJson(`/api/recurring-series/${id}/cancel`, "POST");
    mutateSeries();
  };

  const [view, setView] = useState<View>("calendar");
  const [filter, setFilter] = useState<Filter>("all");
  const [groupByKaki, setGroupByKaki] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());

  // Remembers the last view chosen, same spirit as demo mode remembering
  // nothing else — this one small preference is worth keeping across visits.
  useEffect(() => {
    const stored = window.localStorage.getItem("jio-events-view");
    if (stored === "list" || stored === "calendar") setView(stored);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("jio-events-view", view);
  }, [view]);

  const events = data?.events ?? [];
  const userId = meData?.user?.id;
  const now = Date.now();

  const filtered = useMemo(() => {
    switch (filter) {
      case "hosting":
        return events.filter((e) => e.host_id === userId);
      case "invited":
        return events.filter((e) => e.host_id !== userId);
      case "past":
        return events.filter(
          (e) => e.status !== "open" || new Date(e.scheduled_at).getTime() < now
        );
      default:
        return events;
    }
  }, [events, filter, userId, now]);

  const upcoming = filtered.filter(
    (e) => e.status === "open" && new Date(e.scheduled_at).getTime() > now - 3600000
  );

  // §4a — a single pinned summary, independent of the Hosting/Invited/Past
  // filter and the calendar/list toggle below: "what's next for me,"
  // covering both hosting and invited, not "what matches this filter." A
  // month grid still needs knowing which day to look at; this removes that
  // for the one Jio that actually matters most. Reads from the full `events`
  // set, not `filtered`, on purpose — it should not disappear just because
  // someone has "Hosting" selected.
  //
  // `status !== "cancelled"`, not `=== "open"` — same fix as Home's own
  // "Upcoming" list: a closed Jio is decided, not necessarily over, and a
  // decided-but-future Jio is exactly as "next" as one still being voted
  // on. Only `cancelled` and still-polling Flexi Jios are excluded.
  const nextJio = events
    .filter(
      (e) =>
        e.status !== "cancelled" &&
        e.date_phase !== "polling" &&
        new Date(e.scheduled_at).getTime() > now
    )
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  const past = filtered
    .filter((e) => !upcoming.includes(e))
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  const kakiName = new Map((kakisData?.kakis ?? []).map((k) => [k.id, k.name]));
  const groupedByKaki = useMemo(() => {
    const map = new Map<string, LunchEvent[]>();
    for (const e of filtered) {
      const key = e.kaki_id ?? "";
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
    }
    return map;
  }, [filtered]);

  const selectedDayEvents = filtered.filter(
    (e) =>
      e.date_phase !== "polling" &&
      isSameDay(new Date(e.scheduled_at), selectedDay)
  );

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "hosting", label: "Hosting" },
    { key: "invited", label: "Invited" },
    { key: "past", label: "Past" },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jios</h1>
          <p className="text-stone mt-1 text-sm">
            Lunches you are hosting, invited to, or in the group for.
          </p>
        </div>
        <LinkButton href="/events/new">New</LinkButton>
      </header>

      {features.events && (
        <section className="space-y-2">
          <SectionHeading
            action={
              <Link
                href="/events/recurring/new"
                className="text-ember text-xs underline"
              >
                Make it standing
              </Link>
            }
          >
            Recurring
          </SectionHeading>
          {activeSeries.length === 0 ? (
            <p className="text-stone text-xs">
              No standing Jios yet — turn a weekly lunch into one instead of
              recreating it by hand.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {activeSeries.map((series) => (
                <li
                  key={series.id}
                  className="border-line bg-cream/60 flex items-center justify-between gap-2 rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {series.title}
                    </p>
                    <p className="text-stone text-xs">
                      {WEEKDAY_NAMES[series.weekday]} · {series.time_of_day}
                      {series.mode === "fixed" && series.fixed_place_name
                        ? ` · ${series.fixed_place_name}`
                        : series.mode === "vote"
                          ? " · voted each time"
                          : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/events/recurring/${series.id}/edit`}
                      className="text-stone hover:text-ember text-xs underline"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => cancelSeries(series.id)}
                      className="text-stone hover:text-ember text-xs underline"
                    >
                      Stop
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {error && <ErrorNote>{error.message}</ErrorNote>}
      {isLoading && <SkeletonRows />}

      {!isLoading && events.length === 0 && (
        <EmptyState
          title="No Jios yet"
          description="Start one and everyone invited can add places and rank them."
          action={<LinkButton href="/events/new">Start a Jio</LinkButton>}
        />
      )}

      {!isLoading && events.length > 0 && (
        <>
          {nextJio && (
            <div>
              <p className="text-stone mb-1.5 text-xs font-medium uppercase tracking-wide">
                Up next
              </p>
              <EventRow event={nextJio} />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                    filter === f.key
                      ? "bg-ember border-ember text-white"
                      : "border-line text-stone hover:text-ink"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {view === "list" && features.kakis && (kakisData?.kakis.length ?? 0) > 1 && (
                <button
                  type="button"
                  onClick={() => setGroupByKaki((g) => !g)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    groupByKaki
                      ? "bg-ember border-ember text-white"
                      : "border-line text-stone hover:text-ink"
                  )}
                >
                  Group by Kaki
                </button>
              )}
              <div className="flex shrink-0 gap-1.5">
                {(["calendar", "list"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium capitalize",
                      view === v
                        ? "bg-ember border-ember text-white"
                        : "border-line text-stone hover:text-ink"
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {view === "calendar" ? (
            <>
              <MonthCalendar
                cursor={cursor}
                onCursorChange={setCursor}
                events={filtered}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
              />

              <section>
                <SectionHeading>
                  {isSameDay(selectedDay, new Date())
                    ? "Today"
                    : selectedDay.toLocaleDateString("en-SG", {
                        weekday: "long",
                        day: "numeric",
                        month: "short",
                      })}
                </SectionHeading>
                {selectedDayEvents.length === 0 ? (
                  <p className="text-stone text-sm">Nothing this day.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedDayEvents.map((event) => (
                      <li key={event.id}>
                        <EventRow event={event} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : groupByKaki ? (
            <div className="space-y-5">
              {Array.from(groupedByKaki.entries()).map(([kakiId, list]) => (
                <section key={kakiId || "none"}>
                  <SectionHeading>
                    {kakiId ? (kakiName.get(kakiId) ?? "Kaki") : "No group"}
                  </SectionHeading>
                  <ul className="space-y-2">
                    {list.map((event) => (
                      <li key={event.id}>
                        <EventRow event={event} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <>
              {upcoming.length > 0 && (
                <section>
                  <SectionHeading>Open</SectionHeading>
                  <ul className="space-y-2">
                    {upcoming.map((event) => (
                      <li key={event.id}>
                        <EventRow event={event} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {past.length > 0 && (
                <section>
                  <SectionHeading>Done</SectionHeading>
                  <ul className="space-y-2">
                    {past.slice(0, 20).map((event) => (
                      <li key={event.id}>
                        <EventRow event={event} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
