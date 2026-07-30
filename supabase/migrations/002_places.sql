-- 002_places.sql
-- Every eating spot the app knows about, however it got here.

create table if not exists places (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  lat         double precision not null,
  lng         double precision not null,
  cuisine     text[] default '{}',
  budget_tier smallint check (budget_tier between 1 and 4),
  osm_id      bigint unique,
  source      text default 'manual'
                check (source in ('osm_seed', 'manual', 'discovery')),
  -- 'needs_review' is where auto-discovered places wait for a human. OSM data
  -- quality is uneven, so nothing discovered goes live unreviewed.
  status      text default 'active'
                check (status in ('active', 'needs_review', 'blocked')),
  best_dishes text[] default '{}',
  notes       text,
  created_by  uuid,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- GIN, because cuisine filtering is an array-overlap query.
create index if not exists places_cuisine_idx on places using gin (cuisine);
create index if not exists places_status_idx on places (status);
