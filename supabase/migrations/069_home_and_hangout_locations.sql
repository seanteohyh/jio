-- 069_home_and_hangout_locations.sql
--
-- A third and fourth reference point for walking-distance filtering,
-- alongside the existing shared Office: a private, per-user "Home," and a
-- public, anyone-can-add "Hangout" zone (a church, a mall, wherever a
-- specific friend group actually meets — used repeatedly, by more than
-- just one person, without needing a Kaki or any invite mechanism).
--
-- Staged rollout: this whole system is admin-only for now (enforced in
-- application code, not here — see src/app/api/user-prefs/route.ts and
-- src/app/api/hangout-zones/*), so a regular user's Places/Map experience
-- is completely unaffected by any of this landing.

create table if not exists hangout_zones (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  lat        double precision not null,
  lng        double precision not null,
  created_by uuid not null,
  created_at timestamptz default now()
);

alter table hangout_zones enable row level security;

-- Public — same footing as `places`, not `offices`. Anyone can see and
-- select any zone (that's what makes it work as a "mini office"), and
-- anyone can add one. Editing is open too, same "gatekeeping edits kills
-- contribution" reasoning `places_update` already uses — not scoped to
-- `created_by`.
drop policy if exists "hangout_zones_select" on hangout_zones;
create policy "hangout_zones_select" on hangout_zones
  for select to authenticated using (true);

drop policy if exists "hangout_zones_insert" on hangout_zones;
create policy "hangout_zones_insert" on hangout_zones
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "hangout_zones_update" on hangout_zones;
create policy "hangout_zones_update" on hangout_zones
  for update to authenticated using (true) with check (true);

-- `location_mode` picks which of the three reference points Places/Map/a
-- Jio's place-search compute walking distance from for this account.
-- 'home'/'hangout' each carry their own supporting data below, validated
-- at write time (see the API route) so every read site can trust
-- `location_mode` alone implies that data actually exists — no
-- silent-fallback logic needed anywhere else.
alter table user_prefs
  add column if not exists location_mode text not null default 'office'
    check (location_mode in ('office', 'home', 'hangout')),
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision,
  -- Display only — never read for distance math, which uses home_lat/lng.
  add column if not exists home_address text,
  add column if not exists active_hangout_zone_id uuid references hangout_zones(id);
