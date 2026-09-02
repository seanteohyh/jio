-- 077_fix_admin_user_detail_lobangs_received.sql
--
-- Fixes a pre-existing bug in get_admin_user_detail (064, reproduced
-- verbatim into 076): 'lobangsReceived' counted `lobangs.to_user_id`,
-- a column migration 019 dropped when a lobang moved from one recipient
-- to a many-to-many `lobang_recipients` table (a group send, or one sent
-- to several teammates at once, has no single "to" column to hold). Any
-- real project running 076 hits "column to_user_id does not exist" the
-- moment an admin opens a person's drill-down — this migration is the
-- fix, not a new feature.
--
-- Reproduces 076's full get_admin_user_detail body (create or replace
-- replaces the whole function) with only that one line corrected.

create or replace function get_admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from admins where user_id = v_uid) then
    raise exception 'Admins only';
  end if;

  if not exists (select 1 from profiles where user_id = p_user_id) then
    return null;
  end if;

  select jsonb_build_object(
    'userId', p_user_id,
    'name', (select display_name from profiles where user_id = p_user_id),
    'visits', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'place_id', place_id, 'user_id', user_id, 'rating', rating,
        'best_dishes', best_dishes, 'notes', notes, 'visited_at', visited_at,
        'created_at', created_at, 'is_public', is_public, 'like_count', like_count
      ) order by visited_at desc), '[]'::jsonb)
      from visits where user_id = p_user_id
    ),
    'hostedCount', (select count(*) from lunch_events where host_id = p_user_id),
    'kakiMemberships', (
      select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name) order by k.name), '[]'::jsonb)
      from kaki_members km join kakis k on k.id = km.kaki_id
      where km.user_id = p_user_id
    ),
    'lobangsSent', (select count(*) from lobangs where from_user_id = p_user_id),
    -- Fixed: was `lobangs where to_user_id = p_user_id` — that column has
    -- been gone since migration 019. Recipients live in lobang_recipients.
    'lobangsReceived', (select count(*) from lobang_recipients where user_id = p_user_id),
    'lastActiveAt', (
      select max(created_at) from (
        select created_at from lunch_events where host_id = p_user_id
        union all
        select created_at from event_votes where user_id = p_user_id
        union all
        select created_at from visits where user_id = p_user_id
        union all
        select created_at from wishlist where user_id = p_user_id
        union all
        select created_at from lobangs where from_user_id = p_user_id
        union all
        select created_at from place_flags where flagged_by = p_user_id
      ) t
    ),
    'rsvpResponsivenessPct', (
      with invited_events as (
        select id from lunch_events where host_id = p_user_id
        union
        select le.id from lunch_events le
          join kaki_members km on km.kaki_id = le.kaki_id
          where km.user_id = p_user_id
        union
        select ei.event_id as id from event_invitees ei where ei.user_id = p_user_id
      )
      select case
        when count(*) = 0 then null
        else round(
          100.0 * count(*) filter (
            where exists (
              select 1 from event_rsvps r
              where r.event_id = invited_events.id and r.user_id = p_user_id
            )
          ) / count(*)
        )
      end
      from invited_events
    ),
    'dailyActivity', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', v.visit_date,
        'pageViews', v.page_view_count,
        'actions', coalesce(a.actions, '[]'::jsonb)
      ) order by v.visit_date desc), '[]'::jsonb)
      from app_daily_visits v
      left join lateral (
        select jsonb_agg(jsonb_build_object(
          'action', ae.action, 'metadata', ae.metadata, 'createdAt', ae.created_at
        ) order by ae.created_at) as actions
        from action_events ae
        where ae.user_id = v.user_id
          and (ae.created_at at time zone 'Asia/Singapore')::date = v.visit_date
      ) a on true
      where v.user_id = p_user_id
        and v.visit_date >= ((now() at time zone 'Asia/Singapore')::date - interval '29 days')
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function get_admin_user_detail(uuid) to authenticated;
