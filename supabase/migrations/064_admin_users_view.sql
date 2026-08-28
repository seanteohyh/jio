-- 064_admin_users_view.sql
--
-- CHANGES_20260821_combined.md Part 1 §B — the Users view: a composite
-- engagement score (rolling 90 days, admin-adjustable per-signal weights),
-- six rule-based segments, and a per-person drill-down.
--
-- Score weighting is "equal for now, but admin-adjustable" per the source
-- doc's §2 — not a hardcoded constant, an actual persisted setting a
-- future admin can change. `admin_engagement_weights` is a one-row
-- singleton table (id always 1), same shape as other single-row config
-- would take in this schema; RLS is enabled with *no* policies at all, so
-- every access must go through the two SECURITY DEFINER functions below,
-- which check admin status themselves — same "no policies, function is the
-- only door" pattern as `recovery_tokens`.
create table if not exists admin_engagement_weights (
  id smallint primary key default 1 check (id = 1),
  hosted_weight numeric not null default 1,
  voted_weight  numeric not null default 1,
  rsvp_weight   numeric not null default 1,
  visit_weight  numeric not null default 1,
  review_weight numeric not null default 1,
  lobang_weight numeric not null default 1,
  updated_at    timestamptz,
  updated_by    uuid references auth.users(id)
);

insert into admin_engagement_weights (id) values (1)
on conflict (id) do nothing;

alter table admin_engagement_weights enable row level security;

create or replace function get_engagement_weights()
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

  select jsonb_build_object(
    'hosted', hosted_weight, 'voted', voted_weight, 'rsvp', rsvp_weight,
    'visit', visit_weight, 'review', review_weight, 'lobang', lobang_weight,
    'updatedAt', updated_at
  ) into v_result
  from admin_engagement_weights where id = 1;

  return v_result;
end;
$$;

grant execute on function get_engagement_weights() to authenticated;

create or replace function set_engagement_weights(
  p_hosted numeric,
  p_voted numeric,
  p_rsvp numeric,
  p_visit numeric,
  p_review numeric,
  p_lobang numeric
)
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
  if p_hosted < 0 or p_voted < 0 or p_rsvp < 0
     or p_visit < 0 or p_review < 0 or p_lobang < 0 then
    raise exception 'Weights cannot be negative';
  end if;

  update admin_engagement_weights
  set hosted_weight = p_hosted,
      voted_weight = p_voted,
      rsvp_weight = p_rsvp,
      visit_weight = p_visit,
      review_weight = p_review,
      lobang_weight = p_lobang,
      updated_at = now(),
      updated_by = v_uid
  where id = 1;

  select jsonb_build_object(
    'hosted', hosted_weight, 'voted', voted_weight, 'rsvp', rsvp_weight,
    'visit', visit_weight, 'review', review_weight, 'lobang', lobang_weight,
    'updatedAt', updated_at
  ) into v_result
  from admin_engagement_weights where id = 1;

  return v_result;
end;
$$;

grant execute on function set_engagement_weights(
  numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;

-- ------------------------------------------------------------ get_admin_users --
-- Six raw per-signal counts per person (hosted/voted/rsvp/visit/review/
-- lobang), a weighted composite score from those, and six rule-based
-- segments computed from the same raw counts plus lastActiveAt/signup date.
-- Segments are not a partition — a person can land in more than one, or
-- none; picked as a reasonable v1 rather than something Sean specified
-- numerically, so worth revisiting once real usage shows whether the
-- thresholds feel right.
create or replace function get_admin_users(p_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cutoff timestamptz := now() - (p_days || ' days')::interval;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from admins where user_id = v_uid) then
    raise exception 'Admins only';
  end if;

  with weights as (
    select * from admin_engagement_weights where id = 1
  ),
  hosted as (
    select host_id as uid, count(*) as cnt
    from lunch_events where created_at >= v_cutoff group by host_id
  ),
  voted as (
    select user_id as uid, count(distinct event_id) as cnt
    from event_votes where created_at >= v_cutoff group by user_id
  ),
  rsvped as (
    -- Lifetime, not windowed — event_rsvps has no timestamp column, the
    -- same schema gap as funnel.respondedToInviteTotal (migration 035).
    select user_id as uid, count(*) as cnt
    from event_rsvps group by user_id
  ),
  visited as (
    select user_id as uid, count(*) as cnt
    from visits where created_at >= v_cutoff group by user_id
  ),
  reviewed as (
    select user_id as uid, count(*) as cnt
    from visits where created_at >= v_cutoff and is_public group by user_id
  ),
  lobanged as (
    select from_user_id as uid, count(*) as cnt
    from lobangs where created_at >= v_cutoff group by from_user_id
  ),
  last_active as (
    -- Lifetime max, not windowed — "dormant" needs the true last-active
    -- date regardless of the analytics window.
    select uid, max(created_at) as last_active_at from (
      select host_id as uid, created_at from lunch_events
      union all
      select user_id, created_at from event_votes
      union all
      select user_id, created_at from visits
      union all
      select user_id, created_at from wishlist
      union all
      select from_user_id, created_at from lobangs
      union all
      select flagged_by, created_at from place_flags
    ) t
    group by uid
  ),
  combined as (
    select
      p.user_id as uid,
      p.display_name as name,
      p.created_at as signup_at,
      coalesce(h.cnt, 0) as hosted_count,
      coalesce(vo.cnt, 0) as voted_count,
      coalesce(rs.cnt, 0) as rsvp_count,
      coalesce(vi.cnt, 0) as visit_count,
      coalesce(rv.cnt, 0) as review_count,
      coalesce(lo.cnt, 0) as lobang_count,
      la.last_active_at
    from profiles p
    left join hosted h on h.uid = p.user_id
    left join voted vo on vo.uid = p.user_id
    left join rsvped rs on rs.uid = p.user_id
    left join visited vi on vi.uid = p.user_id
    left join reviewed rv on rv.uid = p.user_id
    left join lobanged lo on lo.uid = p.user_id
    left join last_active la on la.uid = p.user_id
  ),
  scored as (
    select
      c.*,
      (c.hosted_count * w.hosted_weight
        + c.voted_count * w.voted_weight
        + c.rsvp_count * w.rsvp_weight
        + c.visit_count * w.visit_weight
        + c.review_count * w.review_weight
        + c.lobang_count * w.lobang_weight) as score
    from combined c cross join weights w
  )
  select jsonb_build_object(
    'windowDays', p_days,
    'weights', (
      select jsonb_build_object(
        'hosted', hosted_weight, 'voted', voted_weight, 'rsvp', rsvp_weight,
        'visit', visit_weight, 'review', review_weight, 'lobang', lobang_weight,
        'updatedAt', updated_at
      ) from weights
    ),
    'leaderboard', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', uid, 'name', name, 'score', round(score, 1),
        'hostedCount', hosted_count, 'votedCount', voted_count,
        'rsvpCount', rsvp_count, 'visitCount', visit_count,
        'reviewCount', review_count, 'lobangCount', lobang_count
      ) order by score desc), '[]'::jsonb)
      from (
        select * from scored where score > 0 order by score desc limit 20
      ) t
    ),
    'segments', jsonb_build_object(
      'powerHosts', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', uid, 'name', name, 'score', round(score, 1),
          'hostedCount', hosted_count, 'votedCount', voted_count,
          'rsvpCount', rsvp_count, 'visitCount', visit_count,
          'reviewCount', review_count, 'lobangCount', lobang_count
        ) order by hosted_count desc), '[]'::jsonb)
        from scored where hosted_count >= 3 and voted_count <= 1
      ),
      'activeVoters', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', uid, 'name', name, 'score', round(score, 1),
          'hostedCount', hosted_count, 'votedCount', voted_count,
          'rsvpCount', rsvp_count, 'visitCount', visit_count,
          'reviewCount', review_count, 'lobangCount', lobang_count
        ) order by voted_count desc), '[]'::jsonb)
        from scored where voted_count >= 3 and hosted_count <= 1
      ),
      'rsvpOnlyLurkers', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', uid, 'name', name, 'score', round(score, 1),
          'hostedCount', hosted_count, 'votedCount', voted_count,
          'rsvpCount', rsvp_count, 'visitCount', visit_count,
          'reviewCount', review_count, 'lobangCount', lobang_count
        ) order by rsvp_count desc), '[]'::jsonb)
        from scored where rsvp_count >= 3 and voted_count = 0 and hosted_count = 0
      ),
      'reviewers', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', uid, 'name', name, 'score', round(score, 1),
          'hostedCount', hosted_count, 'votedCount', voted_count,
          'rsvpCount', rsvp_count, 'visitCount', visit_count,
          'reviewCount', review_count, 'lobangCount', lobang_count
        ) order by review_count desc), '[]'::jsonb)
        from scored where review_count >= 2
      ),
      'dormant', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', uid, 'name', name, 'score', round(score, 1),
          'hostedCount', hosted_count, 'votedCount', voted_count,
          'rsvpCount', rsvp_count, 'visitCount', visit_count,
          'reviewCount', review_count, 'lobangCount', lobang_count
        ) order by name), '[]'::jsonb)
        from scored
        where last_active_at is null or last_active_at < now() - interval '30 days'
      ),
      'newAndActive', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', uid, 'name', name, 'score', round(score, 1),
          'hostedCount', hosted_count, 'votedCount', voted_count,
          'rsvpCount', rsvp_count, 'visitCount', visit_count,
          'reviewCount', review_count, 'lobangCount', lobang_count
        ) order by name), '[]'::jsonb)
        from scored
        where signup_at >= now() - interval '30 days'
          and (hosted_count + voted_count + visit_count + lobang_count) > 0
      )
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function get_admin_users(integer) to authenticated;

-- ------------------------------------------------------------ get_admin_user_detail --
-- One person's drill-down: every visit regardless of is_public (a
-- deliberate, documented privacy debt — see AdminUserDetail's doc comment
-- in src/types/index.ts), plus admin-only context computeUserMetrics alone
-- can't answer.
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
    'lobangsReceived', (select count(*) from lobangs where to_user_id = p_user_id),
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
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function get_admin_user_detail(uuid) to authenticated;
