-- 019_lobang_group_send.sql
--
-- A Lobang can now target either specific individuals (unchanged) or an
-- entire Kaki at once. Recipients move off `lobangs` and into their own
-- table, snapshotted at send time rather than resolved dynamically — a
-- later membership change must never silently alter who a past lobang was
-- "sent to". `lobangs.kaki_id` is purely for display provenance ("sent to
-- LazadaOne Lunch Kakis"); the actual recipient list always lives in
-- lobang_recipients. See CHANGELOG_20260729.md.

create table if not exists lobang_recipients (
  lobang_id uuid not null references lobangs(id) on delete cascade,
  user_id   uuid not null,
  seen_at   timestamptz,
  primary key (lobang_id, user_id)
);

create index if not exists lobang_recipients_user_idx on lobang_recipients (user_id);

-- Backfill: every existing lobang had exactly one recipient, stored inline
-- on the lobangs row itself.
insert into lobang_recipients (lobang_id, user_id, seen_at)
select id, to_user_id, seen_at from lobangs
on conflict (lobang_id, user_id) do nothing;

alter table lobangs add column if not exists kaki_id uuid references kakis(id);

-- The old policies from 016_lobangs.sql reference to_user_id directly, so
-- they must go before the column does — Postgres won't drop a column a
-- policy still depends on. lobangs_select/delete are recreated further
-- down; lobangs_update has nothing left to do once seen_at moves off this
-- table, so it's dropped for good.
drop policy if exists "lobangs_select" on lobangs;
drop policy if exists "lobangs_update" on lobangs;
drop policy if exists "lobangs_delete" on lobangs;

-- Dropping these columns also drops the inline `check (from_user_id <>
-- to_user_id)` constraint automatically, since it references to_user_id.
alter table lobangs drop column if exists to_user_id;
alter table lobangs drop column if exists seen_at;

alter table lobang_recipients enable row level security;

drop policy if exists "lobang_recipients_select" on lobang_recipients;
create policy "lobang_recipients_select" on lobang_recipients
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from lobangs l
      where l.id = lobang_id and l.from_user_id = auth.uid()
    )
  );

drop policy if exists "lobang_recipients_insert" on lobang_recipients;
create policy "lobang_recipients_insert" on lobang_recipients
  for insert to authenticated
  with check (
    exists (
      select 1 from lobangs l
      where l.id = lobang_id and l.from_user_id = auth.uid()
    )
  );

-- Update is only ever "mark as seen", and only that recipient can do it.
drop policy if exists "lobang_recipients_update" on lobang_recipients;
create policy "lobang_recipients_update" on lobang_recipients
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A recipient dismissing "their copy" deletes only their own row here, so a
-- group send's other recipients are unaffected. The sender retracting the
-- whole send deletes the lobangs row instead (see below), which cascades.
drop policy if exists "lobang_recipients_delete" on lobang_recipients;
create policy "lobang_recipients_delete" on lobang_recipients
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from lobangs l
      where l.id = lobang_id and l.from_user_id = auth.uid()
    )
  );

create policy "lobangs_select" on lobangs
  for select to authenticated
  using (
    from_user_id = auth.uid()
    or exists (
      select 1 from lobang_recipients r
      where r.lobang_id = id and r.user_id = auth.uid()
    )
  );

create policy "lobangs_delete" on lobangs
  for delete to authenticated
  using (from_user_id = auth.uid());
