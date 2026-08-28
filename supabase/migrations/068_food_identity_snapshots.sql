-- 068_food_identity_snapshots.sql
--
-- CHANGES_20260821_combined2.md Item 1 — locked monthly snapshots of the
-- rule-based food identity cards computed in src/lib/foodIdentity.ts.
-- "Locked" is the whole point: these are not computed live on each page
-- load (which would mean an archetype could flicker between visits mid-
-- month), only once a month by the new cron
-- (/api/cron/food-identity), which writes a row here and never touches it
-- again — the next month's run inserts a new row for the new month rather
-- than overwriting this one, which is what keeps prior months browsable.
--
-- Both tables are written by the cron only (via the service-role client,
-- same "no user session in a cron run" reasoning as the discovery cron's
-- `places` writes in src/app/api/cron/discover/route.ts) — there is
-- deliberately no insert/update policy for `authenticated`, only select.

create table if not exists user_food_identity_snapshots (
  user_id     uuid not null references auth.users(id) on delete cascade,
  month       text not null,
  archetype   text not null,
  headline    text not null,
  description text not null,
  computed_at timestamptz not null default now(),
  primary key (user_id, month)
);

create table if not exists kaki_food_identity_snapshots (
  kaki_id                   uuid not null references kakis(id) on delete cascade,
  month                     text not null,
  headline                  text not null,
  description               text not null,
  most_active_user_id       uuid,
  most_active_visits        int,
  adventurer_user_id        uuid,
  adventurer_distinct_places int,
  computed_at               timestamptz not null default now(),
  primary key (kaki_id, month)
);

alter table user_food_identity_snapshots enable row level security;
alter table kaki_food_identity_snapshots enable row level security;

-- Private to the person it's about — same footing as their own visits, some
-- of which may themselves be private (visits.is_private).
drop policy if exists "user_food_identity_snapshots_select" on user_food_identity_snapshots;
create policy "user_food_identity_snapshots_select" on user_food_identity_snapshots
  for select to authenticated using (user_id = auth.uid());

-- Same "readable by any authenticated user" footing as kakis/kaki_members
-- themselves (010_kakis.sql) — joining a Kaki is by unguessable token, and a
-- membership-scoped policy here would need the same recursive-lookup shape
-- that comment already rules out.
drop policy if exists "kaki_food_identity_snapshots_select" on kaki_food_identity_snapshots;
create policy "kaki_food_identity_snapshots_select" on kaki_food_identity_snapshots
  for select to authenticated using (true);
