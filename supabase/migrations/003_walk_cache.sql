-- 003_walk_cache.sql
-- Walking times are expensive to compute (an external API call per pair) and
-- almost never change, so they are computed once by a script and read from
-- here forever after.

create table if not exists walk_cache (
  office_id    uuid not null references offices(id) on delete cascade,
  place_id     uuid not null references places(id) on delete cascade,
  walk_minutes smallint,
  distance_m   int,
  computed_at  timestamptz default now(),
  primary key (office_id, place_id)
);

create index if not exists walk_cache_place_idx on walk_cache (place_id);
