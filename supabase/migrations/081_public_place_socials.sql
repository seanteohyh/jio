-- 081_public_place_socials.sql
--
-- A place's `socials_url` (CHANGES_20260821b.md §1) carries no more
-- sensitivity than its coordinates or Google listing already do (046/047/049's
-- own reasoning) — it's a link the place's owner chose to make public, same
-- as the Instagram/Facebook icon already shown next to "View on Google Maps"
-- for a signed-in visitor. Widens both public-preview functions the same
-- "drop, then create with the extra column" way 047/049 did, since
-- `returns table (...)` can't have a column added via `create or replace`.

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
  google_place_id text,
  socials_url text
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
      p.google_place_id,
      p.socials_url
    from places p
    where p.id = p_place_id
      and p.status = 'active';
end;
$$;

grant execute on function get_public_place(uuid) to anon, authenticated;

drop function if exists get_public_lobang(text);

create function get_public_lobang(p_token text)
returns table (
  place_id uuid,
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
  google_place_id text,
  socials_url text,
  from_display_name text,
  note text,
  created_at timestamptz
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
      p.google_place_id,
      p.socials_url,
      coalesce(pr.display_name, 'A teammate'),
      l.note,
      l.created_at
    from lobangs l
    join places p on p.id = l.place_id
    left join profiles pr on pr.user_id = l.from_user_id
    where l.public_token = p_token
      and p.status = 'active';
end;
$$;

grant execute on function get_public_lobang(text) to anon, authenticated;
