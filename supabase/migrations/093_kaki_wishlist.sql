-- 093_kaki_wishlist.sql
--
-- Group-level counterpart to the existing personal `wishlist` table
-- (migration behind WishlistEntry) — same shape, scoped to a kaki_id
-- instead of a user_id, and multi-writer: any current member can add or
-- remove an entry, same trust level 079_kaki_member_rename.sql already
-- extended to "any member" for renaming the group itself.
--
-- Numbered 093, not 082 as originally drafted — 082/083 were already
-- taken (082_kaki_trailblazer.sql, 083_place_delivery_links.sql) by the
-- time this shipped.

create table kaki_wishlist_entries (
  id uuid primary key default gen_random_uuid(),
  kaki_id uuid not null references kakis(id) on delete cascade,
  place_id uuid not null references places(id) on delete cascade,
  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (kaki_id, place_id)
);

alter table kaki_wishlist_entries enable row level security;

-- Same membership check 079 uses for kakis_update — read access to
-- anyone who can already see the kaki (kaki_members_select is `using (true)`,
-- consistent with that migration's note about not looping back into kakis).
create policy "kaki_wishlist_select" on kaki_wishlist_entries
  for select to authenticated
  using (
    exists (
      select 1 from kaki_members
      where kaki_members.kaki_id = kaki_wishlist_entries.kaki_id
        and kaki_members.user_id = auth.uid()
    )
  );

create policy "kaki_wishlist_insert" on kaki_wishlist_entries
  for insert to authenticated
  with check (
    added_by = auth.uid()
    and exists (
      select 1 from kaki_members
      where kaki_members.kaki_id = kaki_wishlist_entries.kaki_id
        and kaki_members.user_id = auth.uid()
    )
  );

-- Any member can remove any entry, not just whoever added it — mirrors
-- 079's "once you're a member, you're trusted with the group's shared
-- state" reasoning exactly, rather than inventing a narrower rule here.
create policy "kaki_wishlist_delete" on kaki_wishlist_entries
  for delete to authenticated
  using (
    exists (
      select 1 from kaki_members
      where kaki_members.kaki_id = kaki_wishlist_entries.kaki_id
        and kaki_members.user_id = auth.uid()
    )
  );
