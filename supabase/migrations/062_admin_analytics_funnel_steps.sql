-- 062_admin_analytics_funnel_steps.sql
--
-- CHANGES_20260821_combined.md Part 1 §D — turns the funnel's four same-day
-- counts (never a real funnel: no shared population, no drop-off) into an
-- actual step funnel: invited -> responded -> voted -> attended -> reviewed,
-- scoped to every *decided* Jio (closed with a winner) in the window, since
-- a Jio that never resolved has nothing to attend or review.
--
-- "Attended" = RSVP'd yes (decided in the source doc's §2 — the app's own
-- explicit signal, higher coverage than requiring a logged visit). Two
-- schema-forced approximations, not oversights:
--   * `event_rsvps` has no timestamp, so "responded" can't be dated — the
--     trend below buckets by the *Jio's* creation week instead.
--   * `visits` has no `event_id`, so "reviewed" can't be tied to which Jio
--     prompted it — a participant counts as reviewed if they logged any
--     visit to the winning place at or after the Jio's `closed_at`.
--
-- `create or replace function` requires the whole body, not just the new
-- key, so this re-issues 061's entire function verbatim plus the new
-- 'funnelSteps' object rather than trying to patch one key in place.
create or replace function get_admin_analytics(p_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cutoff timestamptz := now() - (p_days || ' days')::interval;
  v_today date := (now() at time zone 'Asia/Singapore')::date;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from admins where user_id = v_uid) then
    raise exception 'Admins only';
  end if;

  select jsonb_build_object(
    'windowDays', p_days,
    'generatedAt', now(),

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
            group by ev.id
          ) t
        ), 0),
        'medianTimeToDecisionHours', (
          select percentile_cont(0.5) within group (
            order by extract(epoch from (closed_at - created_at)) / 3600
          )
          from lunch_events
          where created_at >= v_cutoff and closed_at is not null
        )
      )
      from lunch_events where created_at >= v_cutoff
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

    -- New in this migration: the real step funnel, scoped to decided Jios
    -- only (closed with a winner) in the window.
    'funnelSteps', (
      with decided_events as (
        select id, created_at, closed_at, winner_place_id, kaki_id, host_id
        from lunch_events
        where created_at >= v_cutoff and status = 'closed' and winner_place_id is not null
      ),
      participants as (
        -- Same participant resolution as resolveEventParticipants() in
        -- src/lib/data/*Repo.ts: host + kaki members + explicit invitees.
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

grant execute on function get_admin_analytics(integer) to authenticated;
