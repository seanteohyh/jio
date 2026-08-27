-- 059_starting_soon_reminders.sql
--
-- CHANGES_20260821c.md §1 — a configurable "starting soon" reminder,
-- deliberately a new, separate feature from the existing non-responder
-- nudge (039_close_reminder.sql / claim_event_reminder): that one is fixed
-- at 30 minutes, only pushes people who haven't voted or RSVP'd yet, and
-- is one-shot per *event*. This one is scoped to confirmed-going attendees
-- (event_rsvps.response = 'yes') regardless of whether they voted or
-- RSVP'd early, configurable per person, and one-shot per (event, user) —
-- a genuinely different recipient query and a genuinely different data
-- shape, not a variation on the old column.
--
-- user_prefs gains the "You"-page defaults: reminders_enabled (the on/off
-- switch, on by default) and reminder_lead_minutes (the default lead time,
-- 30 to match what the existing reminder already trained people to expect).
alter table user_prefs
  add column if not exists reminders_enabled boolean not null default true,
  add column if not exists reminder_lead_minutes integer not null default 30
    check (reminder_lead_minutes > 0);

-- One row per (event, user) who has ever had this reminder considered for
-- them — created lazily, either by the scheduled scan below (lead_minutes
-- left null, meaning "used their default at claim time") or by the user
-- setting a per-Jio override ahead of time (lead_minutes set, sent_at still
-- null until it actually fires). Never written to directly by app code
-- outside RLS except sent_at, which only the service-role scan touches.
create table if not exists event_reminder_state (
  event_id      uuid not null references lunch_events(id) on delete cascade,
  user_id       uuid not null,
  lead_minutes  integer check (lead_minutes > 0),
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_reminder_state_event_idx
  on event_reminder_state (event_id);

alter table event_reminder_state enable row level security;

-- Same shape as user_prefs above: strictly own-row. The scheduled scan
-- writes `sent_at` through the service-role client, which bypasses RLS
-- entirely (same reasoning as listReviewLikesSince's cross-user read) —
-- there is no legitimate reason for one user's client to see or touch
-- another's reminder state, so no policy grants that on purpose.
drop policy if exists "event_reminder_state_select" on event_reminder_state;
create policy "event_reminder_state_select" on event_reminder_state
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "event_reminder_state_insert" on event_reminder_state;
create policy "event_reminder_state_insert" on event_reminder_state
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "event_reminder_state_update" on event_reminder_state;
create policy "event_reminder_state_update" on event_reminder_state
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
