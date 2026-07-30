-- 008_wishlist.sql
-- Want-to-try bookmarks. Feeds a small positive weight in the recommender, so
-- saving something actually makes it more likely to be suggested.

create table if not exists wishlist (
  user_id    uuid not null,
  place_id   uuid not null references places(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, place_id)
);

create index if not exists wishlist_user_idx on wishlist (user_id);

alter table wishlist enable row level security;

-- Owner-only, all the way through. A wishlist is private by nature.
drop policy if exists "wishlist_select" on wishlist;
create policy "wishlist_select" on wishlist
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "wishlist_insert" on wishlist;
create policy "wishlist_insert" on wishlist
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "wishlist_update" on wishlist;
create policy "wishlist_update" on wishlist
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "wishlist_delete" on wishlist;
create policy "wishlist_delete" on wishlist
  for delete to authenticated using (user_id = auth.uid());
