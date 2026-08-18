-- 052_cuisines.sql
--
-- CHANGES_20260818.md §6 — lets a custom cuisine become a permanent, shared
-- option instead of a one-off tag stuck on a single place.
--
-- The real blocker was never the database — `places.cuisine` (002_places.sql)
-- was always a plain `text[]`, no enum, no check constraint, so storing an
-- arbitrary cuisine string already worked via `custom_cuisine_tags`. The
-- blocker was that `Cuisine` (src/types/index.ts) was a compile-time
-- TypeScript union: a fixed set nobody could grow at runtime. This table is
-- the runtime-extensible replacement — seeded with today's 18 so nothing
-- regresses for anyone already using them.

create table if not exists cuisines (
  slug text primary key,
  label text not null,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table cuisines enable row level security;

drop policy if exists "cuisines_select" on cuisines;
create policy "cuisines_select" on cuisines
  for select to authenticated
  using (true);

-- Open to any signed-in user for now, per Sean's explicit framing ("for now,
-- open to anyone, not just admins — may become admin-gated later"). The
-- actual open/admin-only switch is an app-level config flag
-- (config.cuisineAddOpenToAnyone, JIO_CUISINE_ADD_OPEN — same shape as
-- config.nameClaimEnabled), checked in the API route before this policy is
-- ever reached — RLS has no way to read an env var, so it stays permissive
-- here and flipping the switch later is a config change, not a migration.
drop policy if exists "cuisines_insert" on cuisines;
create policy "cuisines_insert" on cuisines
  for insert to authenticated
  with check (true);

insert into cuisines (slug, label) values
  ('chinese', 'Chinese'),
  ('malay', 'Malay'),
  ('indian', 'Indian'),
  ('japanese', 'Japanese'),
  ('korean', 'Korean'),
  ('thai', 'Thai'),
  ('vietnamese', 'Vietnamese'),
  ('western', 'Western'),
  ('italian', 'Italian'),
  ('local', 'Local'),
  ('halal', 'Halal'),
  ('vegetarian', 'Vegetarian'),
  ('cafe', 'Cafe'),
  ('fast_food', 'Fast Food'),
  ('food_court', 'Food Court'),
  ('dessert', 'Dessert'),
  ('modern', 'Modern'),
  ('traditional', 'Traditional')
on conflict (slug) do nothing;

-- Admin combine tool, decided the same day rather than left for later —
-- normalizing the slug on write catches exact duplicates for free but not
-- near-duplicates ("Korean BBQ" / "korean bbq" / "KBBQ"). Mirrors
-- merge_user_accounts (040_account_merge.sql) exactly: one SECURITY DEFINER
-- function doing the reassignment, called from an admin-gated API route
-- that itself does the caller-is-admin check (same split as
-- mergeUserAccounts/supabaseRepo.ts) rather than duplicating that check
-- inside the function.
create or replace function merge_cuisines(p_keep_slug text, p_merge_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_keep_slug = p_merge_slug then
    raise exception 'Cannot merge a cuisine into itself';
  end if;

  update places
  set cuisine = (
    select array(
      select distinct unnest(array_replace(cuisine, p_merge_slug, p_keep_slug))
    )
  )
  where p_merge_slug = any(cuisine);

  update user_prefs
  set cuisine_likes = (
    select array(
      select distinct unnest(array_replace(cuisine_likes, p_merge_slug, p_keep_slug))
    )
  )
  where p_merge_slug = any(cuisine_likes);

  update user_prefs
  set cuisine_dislikes = (
    select array(
      select distinct unnest(array_replace(cuisine_dislikes, p_merge_slug, p_keep_slug))
    )
  )
  where p_merge_slug = any(cuisine_dislikes);

  delete from cuisines where slug = p_merge_slug;
end;
$$;

grant execute on function merge_cuisines(text, text) to authenticated;

-- Preview counts before a combine commits. `user_prefs_select` (007_rls.sql)
-- is strictly self-only ("nobody else's business what you refuse to eat"),
-- so a plain client-side query would only ever see the calling admin's own
-- row — SECURITY DEFINER bypasses that the same way get_push_targets and
-- friends already do elsewhere in this schema. Returns aggregate counts
-- only, never row contents, so this stays safe to grant broadly rather than
-- needing its own admin check.
create or replace function count_cuisine_references(p_slug text)
returns table (place_count bigint, profile_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*) from places where p_slug = any(cuisine)),
    (select count(*) from user_prefs
      where p_slug = any(cuisine_likes) or p_slug = any(cuisine_dislikes));
$$;

grant execute on function count_cuisine_references(text) to authenticated;

-- ----------------------------------------------------------------- sanity checks ---
-- Read after running. The first must return 18 (or more, if this runs
-- after cuisines have already been added live); the second must return
-- exactly one row.

select count(*) from cuisines;

select proname from pg_proc where proname = 'merge_cuisines';
