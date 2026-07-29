-- 004_visits.sql
-- A visit is both a private diary entry and, when is_public is set, a review
-- the rest of the team can read. One table, one flag — rather than two tables
-- that drift out of sync.

create table if not exists visits (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid references places(id) on delete cascade,
  user_id     uuid,
  rating      smallint check (rating between 1 and 5),
  best_dishes text[] default '{}',
  notes       text,
  visited_at  date default current_date,
  created_at  timestamptz default now(),
  is_public   boolean not null default false
);

create index if not exists visits_place_idx on visits (place_id);
create index if not exists visits_user_idx on visits (user_id);
create index if not exists visits_visited_at_idx on visits (visited_at desc);
