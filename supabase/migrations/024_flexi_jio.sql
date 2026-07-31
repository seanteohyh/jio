-- 024_flexi_jio.sql
--
-- Flexi Jio: a second event type alongside the existing (unnamed, still
-- just "Jio") fixed-date one. `date_phase` null means "not a Flexi Jio at
-- all" — every existing/regular event is completely unaffected. A Flexi Jio
-- starts 'polling' (people mark which candidate dates they're free) and
-- becomes 'confirmed' once the host locks one in, at which point it behaves
-- identically to a regular Jio for place voting/RSVP/roulette/close — no
-- new code needed for phase 2, only phase 1 is new here.
--
-- `lunch_events.scheduled_at` stays a plain not-null-in-practice column
-- throughout — while polling, it holds a provisional value (the earliest
-- candidate date) rather than being left null, so it keeps sorting/display
-- code elsewhere in the app working unchanged; `date_phase` is the
-- authoritative signal for "has this actually been decided yet".
-- See CHANGELOG_20260729.md, "Flexi Jio — availability-based date voting".

alter table lunch_events
  add column if not exists date_phase text check (date_phase in ('polling', 'confirmed'));

create table if not exists event_candidate_dates (
  event_id   uuid not null references lunch_events(id) on delete cascade,
  date       date not null,
  added_by   uuid not null,
  created_at timestamptz default now(),
  primary key (event_id, date)
);

create index if not exists event_candidate_dates_event_idx
  on event_candidate_dates (event_id);

-- One row per (event, user, date) they've marked themselves free on.
-- Marking availability fully replaces a user's prior selection — the repo
-- layer deletes-then-inserts rather than ever leaving a stale row behind.
create table if not exists event_date_votes (
  event_id   uuid not null references lunch_events(id) on delete cascade,
  user_id    uuid not null,
  date       date not null,
  created_at timestamptz default now(),
  primary key (event_id, user_id, date)
);

create index if not exists event_date_votes_event_idx on event_date_votes (event_id);
create index if not exists event_date_votes_user_idx on event_date_votes (user_id);

alter table event_candidate_dates enable row level security;
alter table event_date_votes enable row level security;

-- Same openness as event_options/event_votes: a lunch date poll is not a
-- secret ballot, and any authenticated user can already read every event.
drop policy if exists "event_candidate_dates_select" on event_candidate_dates;
create policy "event_candidate_dates_select" on event_candidate_dates
  for select to authenticated using (true);

-- Adding a candidate date after polling starts uses the same participant
-- rule as adding a place option (013_event_invitees.sql): host, kaki
-- member, or explicit invitee, while the event is still open.
drop policy if exists "event_candidate_dates_insert" on event_candidate_dates;
create policy "event_candidate_dates_insert" on event_candidate_dates
  for insert to authenticated with check (
    added_by = auth.uid()
    and exists (
      select 1 from lunch_events e
      where e.id = event_id
        and e.status = 'open'
        and (
          e.host_id = auth.uid()
          or (e.kaki_id is not null and exists (
            select 1 from kaki_members m
            where m.kaki_id = e.kaki_id and m.user_id = auth.uid()
          ))
          or exists (
            select 1 from event_invitees i
            where i.event_id = e.id and i.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "event_candidate_dates_delete" on event_candidate_dates;
create policy "event_candidate_dates_delete" on event_candidate_dates
  for delete to authenticated using (
    added_by = auth.uid()
    or exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

drop policy if exists "event_date_votes_select" on event_date_votes;
create policy "event_date_votes_select" on event_date_votes
  for select to authenticated using (true);

drop policy if exists "event_date_votes_insert" on event_date_votes;
create policy "event_date_votes_insert" on event_date_votes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "event_date_votes_delete" on event_date_votes;
create policy "event_date_votes_delete" on event_date_votes
  for delete to authenticated using (user_id = auth.uid());

-- Confirming a date is a plain UPDATE of scheduled_at/date_phase on
-- lunch_events, host only — already covered by the existing
-- lunch_events_update policy (007_rls.sql), no new policy needed.
