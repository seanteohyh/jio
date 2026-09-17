-- 094_expense_entries.sql
--
-- A personal spending ledger — deliberately NOT the same shape as `visits`.
-- Most entries have no place at all (a coffee run, a snack), so place_id
-- is nullable and `label` is free text rather than a place lookup.
-- Strictly private throughout: no policy here ever grants read access to
-- anyone but the row's own user_id — unlike kaki_wishlist_entries above,
-- or visits' own is_public split, there is no shared/public mode for this
-- table at all.
--
-- Numbered 094, not 083 as originally drafted — see 093_kaki_wishlist.sql's
-- own note on the same renumbering.
--
-- source_visit_id is `on delete set null` (confirmed, not cascade): an
-- expense entry never silently disappears just because the visit it was
-- logged alongside got edited or deleted later — it survives, just loses
-- the link.

create table expense_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  label text not null,
  category text not null check (category in ('lunch','coffee','snack','other')),
  -- Both optional, and independent of each other — an entry can carry a
  -- place_id without a source_visit_id (quick-add, typed a known place's
  -- name) or neither (an unlisted coffee stall). Never required.
  place_id uuid references places(id) on delete set null,
  source_visit_id uuid references visits(id) on delete set null,
  logged_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index expense_entries_user_month_idx on expense_entries (user_id, logged_at desc);

alter table expense_entries enable row level security;

-- Strictly self-only, every operation, no exceptions. This is the one
-- piece of financial-shaped data in the app that never becomes a shared
-- or group-aggregate number the way avgBudgetTier already is — that
-- boundary is enforced here, not just in the UI.
create policy "expense_entries_all_own" on expense_entries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
