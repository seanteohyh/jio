-- 009_recos.sql
-- The Food Pool: "you should try this" from a teammate.
--
-- Distinct from a review. A review says how it was; a reco says go.

create table if not exists recos (
  id         uuid primary key default gen_random_uuid(),
  place_id   uuid not null references places(id) on delete cascade,
  user_id    uuid not null,
  comment    text,
  created_at timestamptz default now(),
  -- One reco per person per place. Repeating yourself should update, not
  -- stack up and skew the feed.
  unique (place_id, user_id)
);

create index if not exists recos_place_idx on recos (place_id);
create index if not exists recos_user_idx on recos (user_id);
create index if not exists recos_created_idx on recos (created_at desc);

alter table recos enable row level security;

-- Recommendations are the point of the feed, so everyone reads them.
drop policy if exists "recos_select" on recos;
create policy "recos_select" on recos
  for select to authenticated using (true);

drop policy if exists "recos_insert" on recos;
create policy "recos_insert" on recos
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "recos_update" on recos;
create policy "recos_update" on recos
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "recos_delete" on recos;
create policy "recos_delete" on recos
  for delete to authenticated using (user_id = auth.uid());
