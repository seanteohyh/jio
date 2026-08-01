-- 031_recurring_series.sql
--
-- Perpetual recurring Jios — CHANGES_20260801.md §10 ("Recurring Jios —
-- extended"), the one piece explicitly left undecided pending a product
-- call. Decided 1 Aug (follow-up): a series picks its own mode rather than
-- the app picking one globally —
--
--   'vote'  — each occurrence is an ordinary open Jio seeded with the same
--             candidate places, ranked normally, closed by the host as usual.
--   'fixed' — each occurrence is generated with exactly one option (the
--             standing place) already on it. Nothing here teaches the rest
--             of the app a new "no vote" event type; a one-option Jio
--             already works today, RSVP and closing included, so "fixed"
--             mode leans on that rather than inventing a second code path.
--
-- Generation is lazy, not cron-driven: whoever hosts a series generates its
-- next occurrence the next time they load Home or Jios, if it falls within
-- a short lookahead window. This deliberately does not backfill missed
-- weeks — opening the app after a month away creates the *current* week's
-- occurrence, not four stale ones. See generateDueOccurrences in
-- src/lib/data for the actual date math.
--
-- Known limitation, stated plainly: only the host's own visit triggers
-- generation. If the host doesn't open the app that week, the occurrence
-- waits until they do — same trade-off already made for the discovery cron
-- being once-a-day on Vercel Hobby, chosen here to avoid needing a second
-- cron slot or a SECURITY DEFINER function for what is, for now, a
-- single-owner write.

create table if not exists recurring_series (
  id                uuid primary key default gen_random_uuid(),
  host_id           uuid not null,
  title             text not null,
  office_id         uuid,
  kaki_id           uuid,
  -- Individually invited people, on top of whatever kaki_id resolves to.
  -- Expanded fresh from current kaki membership on every generated
  -- occurrence — deliberately not snapshotted at series-creation time, since
  -- a standing lunch should pick up who's currently in the group each week,
  -- the same way the kaki's own membership already isn't frozen. What *is*
  -- snapshotted, same as any other Jio, is each generated occurrence's own
  -- event_invitees row (migration 019's reasoning, applied per-occurrence).
  invitee_ids       uuid[] not null default '{}',
  -- 0 = Sunday .. 6 = Saturday, matching JS Date#getDay().
  weekday           smallint not null check (weekday between 0 and 6),
  time_of_day       time not null,
  mode              text not null check (mode in ('vote', 'fixed')),
  -- mode = 'fixed' only.
  fixed_place_id    uuid references places(id),
  -- mode = 'vote' only — the option pool seeded into every occurrence.
  option_place_ids  uuid[] not null default '{}',
  status            text not null default 'active'
                       check (status in ('active', 'cancelled')),
  -- The date (not timestamp) of the most recently generated occurrence, so
  -- generation knows what's next without scanning lunch_events.
  last_generated_date date,
  created_at        timestamptz default now(),
  check (
    (mode = 'fixed' and fixed_place_id is not null)
    or (mode = 'vote' and array_length(option_place_ids, 1) > 0)
  )
);

create index if not exists recurring_series_host_idx on recurring_series (host_id);

alter table lunch_events
  add column if not exists recurring_series_id uuid references recurring_series(id);

alter table recurring_series enable row level security;

-- Same permissive-select posture as lunch_events (007_rls.sql) — this is a
-- team-internal app and membership is already derivable from host_id /
-- kaki_id / invitee_ids, same reasoning as everywhere else that's open.
drop policy if exists "recurring_series_select" on recurring_series;
create policy "recurring_series_select" on recurring_series
  for select to authenticated using (true);

drop policy if exists "recurring_series_insert" on recurring_series;
create policy "recurring_series_insert" on recurring_series
  for insert to authenticated with check (host_id = auth.uid());

-- Covers both cancelling a series and generation stamping last_generated_date
-- — both are host-only writes for now (see the file header on why generation
-- isn't gated any harder than that yet).
drop policy if exists "recurring_series_update" on recurring_series;
create policy "recurring_series_update" on recurring_series
  for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());
