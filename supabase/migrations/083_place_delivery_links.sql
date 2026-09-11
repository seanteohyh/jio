-- 083_place_delivery_links.sql
--
-- Foodpanda/Grab delivery links for a place. Some offices subsidize staff
-- orders through one or both of these apps, so having the link ready next
-- to Maps/Socials at Jio voting time (same slot, same manual-paste-only
-- shape as socials_url) saves everyone re-searching for it themselves.
-- Manual-only for the same reason socials_url is (060_place_socials_url.sql):
-- neither Foodpanda nor Grab exposes a public search-by-business-name API
-- to auto-resolve one the way Google Places does.
alter table places
  add column if not exists foodpanda_url text,
  add column if not exists grab_url text;

-- ------------------------------------------------------- re-derive grants --
-- Repeats 060/033/049's own re-grant step, required every time a new places
-- column is added: 027_place_editing.sql's column-level GRANT is a snapshot
-- taken when it ran, invisible to `authenticated` until re-issued. Not
-- excluded from the list below — freely editable by anyone who can edit the
-- place at all, not system-computed like google_place_id.
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

-- --------------------------------------------- widen public-preview RPCs --
-- Same "drop, then create with the extra columns" shape 081 used for
-- socials_url (`returns table (...)` can't have a column added via
-- `create or replace`) — a delivery link carries no more sensitivity than
-- socials_url already does, so it's exposed the same way.

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
  socials_url text,
  foodpanda_url text,
  grab_url text
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
      p.foodpanda_url,
      p.grab_url
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
  foodpanda_url text,
  grab_url text,
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
      p.foodpanda_url,
      p.grab_url,
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
