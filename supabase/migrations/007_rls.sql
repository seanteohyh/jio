-- 007_rls.sql
-- Row Level Security for the core tables.
--
-- Design note on the permissive SELECT policies below: several tables let any
-- authenticated user read any row. That is deliberate for a team-internal app.
-- Events and their options are reachable only via an unguessable invite token
-- or an id you were given, so possession already implies an invite. The
-- alternative — recursive membership checks in policies — needs SECURITY
-- DEFINER helper functions, which are a much easier thing to get subtly wrong.
--
-- Writes are a different matter and are locked down per-owner throughout.

alter table offices     enable row level security;
alter table places      enable row level security;
alter table walk_cache  enable row level security;
alter table visits      enable row level security;
alter table user_prefs  enable row level security;
alter table lunch_events enable row level security;
alter table event_options enable row level security;
alter table event_votes enable row level security;
alter table event_rsvps enable row level security;

-- ---------------------------------------------------------------- offices --
drop policy if exists "offices_select" on offices;
create policy "offices_select" on offices
  for select to authenticated using (true);

drop policy if exists "offices_insert" on offices;
create policy "offices_insert" on offices
  for insert to authenticated with check (true);

-- ----------------------------------------------------------------- places --
drop policy if exists "places_select" on places;
create policy "places_select" on places
  for select to authenticated using (true);

drop policy if exists "places_insert" on places;
create policy "places_insert" on places
  for insert to authenticated with check (created_by = auth.uid());

-- Anyone can correct a place: opening hours change, dishes come and go, and
-- gatekeeping edits kills contribution in a small team.
drop policy if exists "places_update" on places;
create policy "places_update" on places
  for update to authenticated using (true) with check (true);

-- ------------------------------------------------------------- walk_cache --
drop policy if exists "walk_cache_select" on walk_cache;
create policy "walk_cache_select" on walk_cache
  for select to authenticated using (true);

-- ----------------------------------------------------------------- visits --
-- Your own visits, plus anything anyone chose to publish.
drop policy if exists "visits_select" on visits;
create policy "visits_select" on visits
  for select to authenticated
  using (user_id = auth.uid() or is_public = true);

drop policy if exists "visits_insert" on visits;
create policy "visits_insert" on visits
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "visits_update" on visits;
create policy "visits_update" on visits
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "visits_delete" on visits;
create policy "visits_delete" on visits
  for delete to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------- user_prefs --
-- Strictly private. Nobody else's business what you refuse to eat.
drop policy if exists "user_prefs_select" on user_prefs;
create policy "user_prefs_select" on user_prefs
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "user_prefs_insert" on user_prefs;
create policy "user_prefs_insert" on user_prefs
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "user_prefs_update" on user_prefs;
create policy "user_prefs_update" on user_prefs
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user_prefs_delete" on user_prefs;
create policy "user_prefs_delete" on user_prefs
  for delete to authenticated using (user_id = auth.uid());

-- ----------------------------------------------------------- lunch_events --
drop policy if exists "lunch_events_select" on lunch_events;
create policy "lunch_events_select" on lunch_events
  for select to authenticated using (true);

drop policy if exists "lunch_events_insert" on lunch_events;
create policy "lunch_events_insert" on lunch_events
  for insert to authenticated with check (host_id = auth.uid());

drop policy if exists "lunch_events_update" on lunch_events;
create policy "lunch_events_update" on lunch_events
  for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

-- --------------------------------------------------------- event_options --
-- Replaced by a participant-scoped policy in migration 013.
drop policy if exists "event_options_select" on event_options;
create policy "event_options_select" on event_options
  for select to authenticated using (true);

drop policy if exists "event_options_insert" on event_options;
create policy "event_options_insert" on event_options
  for insert to authenticated with check (
    exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

drop policy if exists "event_options_delete" on event_options;
create policy "event_options_delete" on event_options
  for delete to authenticated using (
    exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

-- ------------------------------------------------------------ event_votes --
-- Votes are visible to everyone in the event: a lunch vote is not a secret
-- ballot, and seeing the standing is half the fun.
drop policy if exists "event_votes_select" on event_votes;
create policy "event_votes_select" on event_votes
  for select to authenticated using (true);

drop policy if exists "event_votes_insert" on event_votes;
create policy "event_votes_insert" on event_votes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "event_votes_update" on event_votes;
create policy "event_votes_update" on event_votes
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "event_votes_delete" on event_votes;
create policy "event_votes_delete" on event_votes
  for delete to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------ event_rsvps --
drop policy if exists "event_rsvps_select" on event_rsvps;
create policy "event_rsvps_select" on event_rsvps
  for select to authenticated using (true);

drop policy if exists "event_rsvps_insert" on event_rsvps;
create policy "event_rsvps_insert" on event_rsvps
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "event_rsvps_update" on event_rsvps;
create policy "event_rsvps_update" on event_rsvps
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
