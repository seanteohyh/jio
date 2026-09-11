-- 085_favourites_and_wishlist_note.sql
--
-- Places grows two personal lists on top of "All" and "Lobangs": "Want to
-- try" (the existing wishlist, unchanged in shape) and a new, independent
-- "Favourites" — a place can be either, both, or neither. Same "no separate
-- add/remove endpoints" toggle shape as wishlist itself (008_wishlist.sql),
-- mirrored exactly rather than reusing one table with a type column, so
-- each stays a plain, single-purpose membership table.
create table if not exists favourites (
  user_id    uuid not null,
  place_id   uuid not null references places(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, place_id)
);

create index if not exists favourites_user_idx on favourites (user_id);

alter table favourites enable row level security;

drop policy if exists "favourites_select" on favourites;
create policy "favourites_select" on favourites
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "favourites_insert" on favourites;
create policy "favourites_insert" on favourites
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "favourites_delete" on favourites;
create policy "favourites_delete" on favourites
  for delete to authenticated using (user_id = auth.uid());

-- "Want to try" gets an optional freeform reminder — what specifically to
-- order, not just that the place exists — since "I saved this three months
-- ago, why?" is the actual complaint a plain bookmark doesn't answer.
-- wishlist_update (008_wishlist.sql) already covers editing it.
alter table wishlist
  add column if not exists note text;
