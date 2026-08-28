-- 065_admin_analytics_segment_filter.sql
--
-- CHANGES_20260821_combined.md Part 1 §E — two of the four "interactivity"
-- pieces that need a schema/function change (the other two — the date-
-- range picker and CSV export — are pure client-side work, no migration
-- needed):
--
--   * A segment filter that re-slices the dashboard. Scoped to Jio
--     Outcomes and the real step funnel specifically, not literally every
--     section — Growth's "new users per day" doesn't have a coherent
--     segment-filtered reading (a segment like "power host" is *earned*
--     by activity a brand-new signup hasn't had time to accumulate yet, so
--     filtering signups by it is closer to nonsensical than useful).
--     Filtering "Jios hosted by this segment's members" and "the real
--     funnel among this segment's members" both stay meaningful.
--   * Growth's "new users" sparkline click-through — who actually joined
--     on a given day, not just the count.
--
-- `admin_segment_member_ids` recomputes one segment's membership using the
-- same six rules `get_admin_users` (migration 064) already defines. This
-- duplicates that logic rather than refactoring get_admin_users to share
-- it, on purpose — get_admin_users is already shipped and tested, and
-- risking a regression there to save a second copy of six `where` clauses
-- isn't worth it. Not granted to `authenticated` directly: only
-- get_admin_analytics below calls it, which does its own admin check.
create or replace function admin_segment_member_ids(
  p_segment text,
  p_days integer default 90
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cutoff timestamptz := now() - (p_days || ' days')::interval;
  v_result uuid[];
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from admins where user_id = v_uid) then
    raise exception 'Admins only';
  end if;

  with hosted as (
    select host_id as uid, count(*) as cnt
    from lunch_events where created_at >= v_cutoff group by host_id
  ),
  voted as (
    select user_id as uid, count(distinct event_id) as cnt
    from event_votes where created_at >= v_cutoff group by user_id
  ),
  rsvped as (
    select user_id as uid, count(*) as cnt from event_rsvps group by user_id
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
  )
  select array_agg(uid) into v_result
  from combined
  where
    (p_segment = 'powerHosts' and hosted_count >= 3 and voted_count <= 1)
    or (p_segment = 'activeVoters' and voted_count >= 3 and hosted_count <= 1)
    or (p_segment = 'rsvpOnlyLurkers' and rsvp_count >= 3 and voted_count = 0 and hosted_count = 0)
    or (p_segment = 'reviewers' and review_count >= 2)
    or (p_segment = 'dormant' and (last_active_at is null or last_active_at < now() - interval '30 days'))
    or (p_segment = 'newAndActive' and signup_at >= now() - interval '30 days'
        and (hosted_count + voted_count + visit_count + lobang_count) > 0);

  return coalesce(v_result, array[]::uuid[]);
end;
$$;

revoke all on function admin_segment_member_ids(text, integer) from public;

-- `create or replace function` only replaces a function with the *same*
-- parameter list — adding p_segment changes the signature, so without
-- this drop the old 1-argument version would stick around as a separate,
-- still-`authenticated`-callable overload instead of being replaced.
drop function if exists get_admin_analytics(integer);

create or replace function get_admin_analytics(
  p_days integer default 90,
  p_segment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cutoff timestamptz := now() - (p_days || ' days')::interval;
  v_today date := (now() at time zone 'Asia/Singapore')::date;
  v_segment_members uuid[];
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from admins where user_id = v_uid) then
    raise exception 'Admins only';
  end if;

  if p_segment is not null then
    v_segment_members := admin_segment_member_ids(p_segment, p_days);
  end if;

  select jsonb_build_object(
    'windowDays', p_days,
    'generatedAt', now(),
    'appliedSegment', p_segment,

    'funnel', jsonb_build_object(
      'participatingDau', (
        select count(distinct uid) from (
          select user_id as uid from event_votes
            where (created_at at time zone 'Asia/Singapore')::date = v_today
          union
          select host_id from lunch_events
            where (created_at at time zone 'Asia/Singapore')::date = v_today
          union
          select user_id from visits
            where (created_at at time zone 'Asia/Singapore')::date = v_today
          union
          select user_id from wishlist
            where (created_at at time zone 'Asia/Singapore')::date = v_today
          union
          select created_by from places
            where created_by is not null
              and (created_at at time zone 'Asia/Singapore')::date = v_today
          union
          select flagged_by from place_flags
            where (created_at at time zone 'Asia/Singapore')::date = v_today
        ) t
      ),
      'respondedToInviteTotal', (select count(*) from event_rsvps),
      'votedInJioToday', (
        select count(distinct user_id) from event_votes
        where (created_at at time zone 'Asia/Singapore')::date = v_today
      ),
      'hostedJioToday', (
        select count(distinct host_id) from lunch_events
        where (created_at at time zone 'Asia/Singapore')::date = v_today
      )
    ),

    'growth', jsonb_build_object(
      'newUsersPerDay', (
        select coalesce(jsonb_agg(jsonb_build_object('date', d, 'count', c) order by d), '[]'::jsonb)
        from (
          select (created_at at time zone 'Asia/Singapore')::date as d, count(*) as c
          from profiles where created_at >= v_cutoff group by 1
        ) t
      ),
      -- New in this migration: who actually joined each day, powering the
      -- Growth sparkline's click-through (Part 1 §E). Not segment-filtered
      -- — see the header comment on why that filter doesn't apply here.
      'newUsersDetail', (
        select coalesce(jsonb_agg(jsonb_build_object('date', d, 'users', users) order by d), '[]'::jsonb)
        from (
          select
            (created_at at time zone 'Asia/Singapore')::date as d,
            jsonb_agg(jsonb_build_object('id', user_id, 'name', display_name) order by display_name) as users
          from profiles
          where created_at >= v_cutoff
          group by 1
        ) t
      ),
      'jiosCreatedPerDay', (
        select coalesce(jsonb_agg(jsonb_build_object('date', d, 'count', c) order by d), '[]'::jsonb)
        from (
          select (created_at at time zone 'Asia/Singapore')::date as d, count(*) as c
          from lunch_events where created_at >= v_cutoff group by 1
        ) t
      ),
      'placesAddedPerDay', (
        select coalesce(jsonb_agg(jsonb_build_object('date', d, 'count', c) order by d), '[]'::jsonb)
        from (
          select (created_at at time zone 'Asia/Singapore')::date as d, count(*) as c
          from places where created_at >= v_cutoff group by 1
        ) t
      ),
      'kakiGroupsCreatedPerDay', (
        select coalesce(jsonb_agg(jsonb_build_object('date', d, 'count', c) order by d), '[]'::jsonb)
        from (
          select (created_at at time zone 'Asia/Singapore')::date as d, count(*) as c
          from kakis where created_at >= v_cutoff group by 1
        ) t
      ),
      'kakiGroupsCumulative', (select count(*) from kakis)
    ),

    -- Segment-filtered when p_segment is set: only Jios hosted by a member
    -- of that segment (v_segment_members is null when no filter applied).
    'jioOutcomes', (
      select jsonb_build_object(
        'decided', count(*) filter (where status = 'closed' and winner_place_id is not null),
        'closedNoWinner', count(*) filter (where status = 'closed' and winner_place_id is null),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'stillOpen', count(*) filter (where status = 'open'),
        'avgBallotsPerJio', coalesce((
          select avg(voters) from (
            select ev.id, count(distinct v.user_id) as voters
            from lunch_events ev
            join event_votes v on v.event_id = ev.id
            where ev.created_at >= v_cutoff
              and (v_segment_members is null or ev.host_id = any(v_segment_members))
            group by ev.id
          ) t
        ), 0),
        'medianTimeToDecisionHours', (
          select percentile_cont(0.5) within group (
            order by extract(epoch from (closed_at - created_at)) / 3600
          )
          from lunch_events
          where created_at >= v_cutoff and closed_at is not null
            and (v_segment_members is null or host_id = any(v_segment_members))
        )
      )
      from lunch_events
      where created_at >= v_cutoff
        and (v_segment_members is null or host_id = any(v_segment_members))
    ),

    'content', jsonb_build_object(
      'topRatedPlaces', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', id, 'name', name, 'count', visit_count, 'avgRating', avg_rating
        ) order by avg_rating desc), '[]'::jsonb)
        from (
          select id, name, visit_count, avg_rating from places
          where coalesce(visit_count, 0) >= 3 and avg_rating is not null
          order by avg_rating desc limit 10
        ) t
      ),
      'mostVisitedPlaces', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', id, 'name', name, 'count', coalesce(visit_count, 0)
        ) order by coalesce(visit_count, 0) desc), '[]'::jsonb)
        from (
          select id, name, visit_count from places
          order by coalesce(visit_count, 0) desc limit 10
        ) t
      ),
      'cuisineDistribution', (
        select coalesce(jsonb_object_agg(cuisine, cnt), '{}'::jsonb)
        from (
          select unnest(cuisine) as cuisine, count(*) as cnt
          from places group by 1
        ) t
      ),
      'customCuisineTagUsageCount', (
        select coalesce(sum(array_length(custom_cuisine_tags, 1)), 0) from places
      ),
      'walkTimeBuckets', (
        select jsonb_build_array(
          jsonb_build_object('bucket', '0–5 min', 'count', count(*) filter (where walk_minutes <= 5)),
          jsonb_build_object('bucket', '5–10 min', 'count', count(*) filter (where walk_minutes > 5 and walk_minutes <= 10)),
          jsonb_build_object('bucket', '10–15 min', 'count', count(*) filter (where walk_minutes > 10 and walk_minutes <= 15)),
          jsonb_build_object('bucket', '15–20 min', 'count', count(*) filter (where walk_minutes > 15 and walk_minutes <= 20)),
          jsonb_build_object('bucket', '20+ min', 'count', count(*) filter (where walk_minutes > 20))
        )
        from (
          select distinct on (place_id) place_id, walk_minutes
          from walk_cache
          order by place_id, office_id
        ) t
      )
    ),

    'social', jsonb_build_object(
      'mostActiveKakis', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', id, 'name', name, 'count', cnt
        ) order by cnt desc), '[]'::jsonb)
        from (
          select k.id, k.name, count(e.id) as cnt
          from kakis k
          join lunch_events e on e.kaki_id = k.id
          group by k.id, k.name
          having count(e.id) > 0
          order by cnt desc limit 10
        ) t
      ),
      'groupSizeDistribution', (
        select coalesce(jsonb_agg(jsonb_build_object('size', size, 'count', cnt) order by size), '[]'::jsonb)
        from (
          select member_count as size, count(*) as cnt from (
            select kaki_id, count(*) as member_count
            from kaki_members group by kaki_id
          ) sizes
          group by member_count
        ) t
      )
    ),

    'moderation', jsonb_build_object(
      'reportsFiledPerWeek', (
        select coalesce(jsonb_agg(jsonb_build_object('date', w, 'count', c) order by w), '[]'::jsonb)
        from (
          select (date_trunc('week', created_at at time zone 'Asia/Singapore'))::date as w, count(*) as c
          from place_flags where created_at >= v_cutoff group by 1
        ) t
      ),
      'reportsResolvedPerWeek', (
        select coalesce(jsonb_agg(jsonb_build_object('date', w, 'count', c) order by w), '[]'::jsonb)
        from (
          select (date_trunc('week', resolved_at at time zone 'Asia/Singapore'))::date as w, count(*) as c
          from place_flags where resolved_at is not null and created_at >= v_cutoff group by 1
        ) t
      ),
      'avgResolutionHours', (
        select avg(extract(epoch from (resolved_at - created_at)) / 3600)
        from place_flags
        where resolved_at is not null and created_at >= v_cutoff
      ),
      'pendingCount', (select count(*) from place_flags where status = 'pending')
    ),

    'wishlist', jsonb_build_object(
      'savesPerWeek', (
        select coalesce(jsonb_agg(jsonb_build_object('date', w, 'count', c) order by w), '[]'::jsonb)
        from (
          select (date_trunc('week', created_at at time zone 'Asia/Singapore'))::date as w, count(*) as c
          from wishlist where created_at >= v_cutoff group by 1
        ) t
      ),
      'mostSavedPlaces', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'count', counts.cnt
        ) order by counts.cnt desc), '[]'::jsonb)
        from (
          select place_id, count(*) as cnt from wishlist group by place_id
          order by cnt desc limit 10
        ) counts
        join places p on p.id = counts.place_id
      )
    ),

    'performance', (
      with activity as (
        select user_id as uid, created_at from event_votes where created_at >= v_cutoff
        union all
        select host_id, created_at from lunch_events where created_at >= v_cutoff
        union all
        select user_id, created_at from visits where created_at >= v_cutoff
        union all
        select user_id, created_at from wishlist where created_at >= v_cutoff
        union all
        select created_by, created_at from places
          where created_by is not null and created_at >= v_cutoff
        union all
        select flagged_by, created_at from place_flags where created_at >= v_cutoff
      )
      select jsonb_build_object(
        'dauPerDay', (
          select coalesce(jsonb_agg(jsonb_build_object('date', d, 'count', c) order by d), '[]'::jsonb)
          from (
            select (created_at at time zone 'Asia/Singapore')::date as d, count(distinct uid) as c
            from activity group by 1
          ) t
        ),
        'wauPerWeek', (
          select coalesce(jsonb_agg(jsonb_build_object('date', w, 'count', c) order by w), '[]'::jsonb)
          from (
            select (date_trunc('week', created_at at time zone 'Asia/Singapore'))::date as w, count(distinct uid) as c
            from activity group by 1
          ) t
        ),
        'mauPerMonth', (
          select coalesce(jsonb_agg(jsonb_build_object('date', m, 'count', c) order by m), '[]'::jsonb)
          from (
            select (date_trunc('month', created_at at time zone 'Asia/Singapore'))::date as m, count(distinct uid) as c
            from activity group by 1
          ) t
        )
      )
    ),

    -- Segment-filtered when p_segment is set: only participants in Jios
    -- hosted by a member of that segment.
    'funnelSteps', (
      with decided_events as (
        select id, created_at, closed_at, winner_place_id, kaki_id, host_id
        from lunch_events
        where created_at >= v_cutoff and status = 'closed' and winner_place_id is not null
          and (v_segment_members is null or host_id = any(v_segment_members))
      ),
      participants as (
        select
          de.id as event_id,
          de.created_at as event_created_at,
          de.closed_at,
          de.winner_place_id,
          u.uid
        from decided_events de
        cross join lateral (
          select de.host_id as uid
          union
          select km.user_id from kaki_members km where km.kaki_id = de.kaki_id
          union
          select ei.user_id from event_invitees ei where ei.event_id = de.id
        ) u
      ),
      enriched as (
        select
          p.*,
          exists (
            select 1 from event_rsvps r
            where r.event_id = p.event_id and r.user_id = p.uid
          ) as responded,
          exists (
            select 1 from event_rsvps r
            where r.event_id = p.event_id and r.user_id = p.uid and r.response = 'yes'
          ) as attended,
          exists (
            select 1 from event_votes v
            where v.event_id = p.event_id and v.user_id = p.uid
          ) as voted,
          pr.created_at as signup_at
        from participants p
        left join profiles pr on pr.user_id = p.uid
      ),
      scored as (
        select
          e.*,
          (e.attended and exists (
            select 1 from visits vi
            where vi.user_id = e.uid
              and vi.place_id = e.winner_place_id
              and vi.created_at >= e.closed_at
          )) as reviewed
        from enriched e
      )
      select jsonb_build_object(
        'steps', jsonb_build_array(
          jsonb_build_object('step', 'invited', 'count', (select count(*) from scored)),
          jsonb_build_object('step', 'responded', 'count', (select count(*) filter (where responded) from scored)),
          jsonb_build_object('step', 'voted', 'count', (select count(*) filter (where voted) from scored)),
          jsonb_build_object('step', 'attended', 'count', (select count(*) filter (where attended) from scored)),
          jsonb_build_object('step', 'reviewed', 'count', (select count(*) filter (where reviewed) from scored))
        ),
        'trend', jsonb_build_object(
          'invitedPerWeek', (
            select coalesce(jsonb_agg(jsonb_build_object('date', w, 'count', c) order by w), '[]'::jsonb)
            from (
              select (date_trunc('week', event_created_at at time zone 'Asia/Singapore'))::date as w, count(*) as c
              from scored group by 1
            ) t
          ),
          'respondedPerWeek', (
            select coalesce(jsonb_agg(jsonb_build_object('date', w, 'count', c) order by w), '[]'::jsonb)
            from (
              select (date_trunc('week', event_created_at at time zone 'Asia/Singapore'))::date as w, count(*) as c
              from scored where responded group by 1
            ) t
          ),
          'votedPerWeek', (
            select coalesce(jsonb_agg(jsonb_build_object('date', w, 'count', c) order by w), '[]'::jsonb)
            from (
              select (date_trunc('week', event_created_at at time zone 'Asia/Singapore'))::date as w, count(*) as c
              from scored where voted group by 1
            ) t
          ),
          'attendedPerWeek', (
            select coalesce(jsonb_agg(jsonb_build_object('date', w, 'count', c) order by w), '[]'::jsonb)
            from (
              select (date_trunc('week', event_created_at at time zone 'Asia/Singapore'))::date as w, count(*) as c
              from scored where attended group by 1
            ) t
          ),
          'reviewedPerWeek', (
            select coalesce(jsonb_agg(jsonb_build_object('date', w, 'count', c) order by w), '[]'::jsonb)
            from (
              select (date_trunc('week', event_created_at at time zone 'Asia/Singapore'))::date as w, count(*) as c
              from scored where reviewed group by 1
            ) t
          )
        ),
        'cohortBySignupWeek', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'weekStart', w,
            'invited', invited,
            'responded', responded,
            'voted', voted,
            'attended', attended,
            'reviewed', reviewed
          ) order by w), '[]'::jsonb)
          from (
            select
              (date_trunc('week', signup_at at time zone 'Asia/Singapore'))::date as w,
              count(*) as invited,
              count(*) filter (where responded) as responded,
              count(*) filter (where voted) as voted,
              count(*) filter (where attended) as attended,
              count(*) filter (where reviewed) as reviewed
            from scored
            where signup_at is not null
            group by 1
          ) t
        )
      )
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function get_admin_analytics(integer, text) to authenticated;
