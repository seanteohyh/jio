-- 010_kakis.sql
-- "Kaki" is Singlish for the people you do a thing with. Here: a lunch group.

create table if not exists kakis (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  created_by   uuid not null,
  invite_token text unique not null,
  created_at   timestamptz default now()
);

create table if not exists kaki_members (
  kaki_id   uuid not null references kakis(id) on delete cascade,
  user_id   uuid not null,
  joined_at timestamptz default now(),
  primary key (kaki_id, user_id)
);

create index if not exists kaki_members_user_idx on kaki_members (user_id);

-- An event can belong to a group, which is what lets every member add options
-- and vote without being invited one by one.
alter table lunch_events
  add column if not exists kaki_id uuid references kakis(id);

create index if not exists lunch_events_kaki_idx on lunch_events (kaki_id);

alter table kakis enable row level security;
alter table kaki_members enable row level security;

-- Readable by any authenticated user: joining is by unguessable token, and
-- membership-scoped SELECT here would need a recursive policy against
-- kaki_members, which is the classic way to deadlock RLS on this schema.
drop policy if exists "kakis_select" on kakis;
create policy "kakis_select" on kakis
  for select to authenticated using (true);

drop policy if exists "kakis_insert" on kakis;
create policy "kakis_insert" on kakis
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "kakis_update" on kakis;
create policy "kakis_update" on kakis
  for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "kaki_members_select" on kaki_members;
create policy "kaki_members_select" on kaki_members
  for select to authenticated using (true);

-- You may add yourself and only yourself. No adding people to groups.
drop policy if exists "kaki_members_insert" on kaki_members;
create policy "kaki_members_insert" on kaki_members
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "kaki_members_delete" on kaki_members;
create policy "kaki_members_delete" on kaki_members
  for delete to authenticated using (user_id = auth.uid());
