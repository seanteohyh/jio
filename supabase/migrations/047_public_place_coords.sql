-- 047_public_place_coords.sql
-- CHANGES_20260814.md §2: the Google Maps link on /places/[id] is a pure
-- render-time computation from place.lat/place.lng — no stored link, no
-- backend call. The public preview (/p/[id]) wants the same link, but
-- get_public_place (046_public_place_preview.sql) never selected lat/lng
-- in the first place, since the preview didn't need coordinates until now.
--
-- RETURNS TABLE's column list is part of the function's return type, so
-- widening it needs a drop + recreate rather than CREATE OR REPLACE (which
-- Postgres rejects for an incompatible return-type change). `drop function
-- if exists` makes this safe to run whether or not 046 was ever applied.

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
  lng double precision
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
      p.lng
    from places p
    where p.id = p_place_id
      and p.status = 'active';
end;
$$;

grant execute on function get_public_place(uuid) to anon, authenticated;
