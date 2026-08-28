-- 063_admin_place_detail.sql
--
-- CHANGES_20260821_combined.md Part 1 §C — a per-place drill-down behind
-- the Places view's click-through (same admin-only, SECURITY DEFINER
-- pattern as get_admin_analytics, migration 035): visitors, a rating trend
-- over time (not just the single current average), wishlist-save count,
-- lobang-mention count, and how well the place's cuisine/budget lines up
-- with the people who actually go there.
create or replace function get_admin_place_detail(p_place_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cuisine text[];
  v_budget_tier smallint;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from admins where user_id = v_uid) then
    raise exception 'Admins only';
  end if;

  select cuisine, budget_tier into v_cuisine, v_budget_tier
  from places where id = p_place_id;

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'placeId', p_place_id,
    'visitors', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pr.user_id, 'name', pr.display_name, 'count', v.cnt
      ) order by v.cnt desc), '[]'::jsonb)
      from (
        select user_id, count(*) as cnt from visits
        where place_id = p_place_id group by user_id
      ) v
      join profiles pr on pr.user_id = v.user_id
    ),
    'ratingTrend', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', w, 'avgRating', round(avg_rating, 2), 'count', cnt
      ) order by w), '[]'::jsonb)
      from (
        select
          (date_trunc('week', created_at at time zone 'Asia/Singapore'))::date as w,
          avg(rating) as avg_rating,
          count(*) as cnt
        from visits
        where place_id = p_place_id and rating is not null
        group by 1
      ) t
    ),
    'wishlistSaveCount', (
      select count(*) from wishlist where place_id = p_place_id
    ),
    'lobangMentionCount', (
      select count(*) from lobangs where place_id = p_place_id
    ),
    -- null (not 0) when no visitor has any cuisine preference recorded to
    -- compare against at all — "nobody's told us what they like" isn't
    -- the same claim as "this place matches nobody's taste."
    'cuisineAlignmentPct', (
      select case
        when count(*) filter (
          where up.cuisine_likes is not null and array_length(up.cuisine_likes, 1) > 0
        ) = 0 then null
        else round(
          100.0 * count(*) filter (where up.cuisine_likes && v_cuisine)
          / count(*) filter (
              where up.cuisine_likes is not null and array_length(up.cuisine_likes, 1) > 0
            )
        )
      end
      from (select distinct user_id from visits where place_id = p_place_id) dv
      join user_prefs up on up.user_id = dv.user_id
    ),
    'budgetAlignmentPct', (
      select case
        when count(*) = 0 then null
        else round(
          100.0 * count(*) filter (
            where v_budget_tier between up.budget_min and up.budget_max
          ) / count(*)
        )
      end
      from (select distinct user_id from visits where place_id = p_place_id) dv
      join user_prefs up on up.user_id = dv.user_id
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function get_admin_place_detail(uuid) to authenticated;
