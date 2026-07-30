-- 016_lobangs.sql
-- Lobangs: one teammate sending another a personalized "you should try this"
-- for a specific place. Distinct from a `reco`, which is broadcast to
-- everyone — a lobang has exactly one recipient and shows up as theirs.

create table if not exists lobangs (
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null,
  to_user_id   uuid not null,
  place_id     uuid not null references places(id) on delete cascade,
  -- The past Jio this was sent from, if the sender started from one on
  -- their profile. Purely informational — never enforced, and null for a
  -- lobang sent from anywhere else (e.g. a place page).
  event_id     uuid references lunch_events(id) on delete set null,
  note         text,
  created_at   timestamptz default now(),
  -- Null until the recipient has seen it.
  seen_at      timestamptz,
  check (from_user_id <> to_user_id)
);

create index if not exists lobangs_to_idx on lobangs (to_user_id);
create index if not exists lobangs_from_idx on lobangs (from_user_id);
create index if not exists lobangs_created_idx on lobangs (created_at desc);

alter table lobangs enable row level security;

-- Only the two people involved ever see a lobang — it is a direct tip-off,
-- not something for the whole team's feed.
drop policy if exists "lobangs_select" on lobangs;
create policy "lobangs_select" on lobangs
  for select to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

drop policy if exists "lobangs_insert" on lobangs;
create policy "lobangs_insert" on lobangs
  for insert to authenticated
  with check (from_user_id = auth.uid());

-- Update is only ever "mark as seen", and only the recipient can do that.
drop policy if exists "lobangs_update" on lobangs;
create policy "lobangs_update" on lobangs
  for update to authenticated
  using (to_user_id = auth.uid())
  with check (to_user_id = auth.uid());

-- Either side can dismiss/retract their own copy of the exchange.
drop policy if exists "lobangs_delete" on lobangs;
create policy "lobangs_delete" on lobangs
  for delete to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());
