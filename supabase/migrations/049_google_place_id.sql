-- 049_google_place_id.sql
-- CHANGES_20260814.md §2, revisited: the plain coordinate-based Maps link
-- (047) opens Google Maps centred on a pin, not the restaurant's own
-- listing — no name, no reviews, no photos. This resolves each place to its
-- actual Google Place ID (best-effort, server-side, via the app's own
-- Places API lookup in src/lib/googlePlaces.ts) so the link can open the
-- real listing instead, falling back to the coordinate link whenever no
-- confident match exists — nothing about the fallback path changes.
--
-- `google_place_id` is a system-computed column, same class as
-- `avg_rating`/`visit_count` — a client must not be able to point a place's
-- Maps link at an arbitrary listing via a plain edit. 027_place_editing.sql
-- derives places' UPDATE grant dynamically from an exclusion list
-- specifically so a new protected column doesn't slip through by accident;
-- this re-runs that same block with `google_place_id` added to it, and adds
-- a `status`-style SECURITY DEFINER function (`set_google_place_id`) as the
-- one legitimate way to set it — called by the app server right after a
-- place is created or has its name/address edited, never from the client
-- directly.

alter table places add column if not exists google_place_id text;

do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into v_cols
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'places'
      and column_name not in (
        'id', 'created_by', 'created_at', 'status',
        'avg_rating', 'visit_count', 'rating_updated_at', 'has_pending_flag',
        'osm_id', 'source',
        'google_place_id'
      );

  execute 'revoke update on places from authenticated';
  execute format('grant update (%s) on places to authenticated', v_cols);
end $$;

create or replace function set_google_place_id(
  p_place_id uuid,
  p_google_place_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update places
  set google_place_id = p_google_place_id
  where id = p_place_id;
end;
$$;

grant execute on function set_google_place_id(uuid, text) to authenticated;

-- Widen the public preview the same way 047 did for lat/lng — a place's
-- Google listing carries no more sensitivity than its coordinates already
-- do (046/047's reasoning), so /p/[id] gets the real listing link too.

drop function if exists get_public_place(uuid);

create function get_public_place(p_place_id uuid)
returns table (
  id uuid,
  name text,
  address text,
  cuisine text[],
  custom_cuisine_tags text[],
  budget_tier smallint,
  best_dishes text[],
  avg_rating numeric,
  visit_count integer,
  lat double precision,
  lng double precision,
  google_place_id text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      p.id,
      p.name,
      p.address,
      p.cuisine,
      p.custom_cuisine_tags,
      p.budget_tier,
      p.best_dishes,
      p.avg_rating,
      p.visit_count,
      p.lat,
      p.lng,
      p.google_place_id
    from places p
    where p.id = p_place_id
      and p.status = 'active';
end;
$$;

grant execute on function get_public_place(uuid) to anon, authenticated;

-- ----------------------------------------------------------------- sanity checks ---
-- Read these after running. `google_place_id` must not appear in the first
-- result; the second must return exactly one row.

select column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'places'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE'
order by column_name;

select proname from pg_proc where proname = 'set_google_place_id';
