-- 076_daily_activity_log.sql
--
-- Daily Activity Log spec (Full spec, per Sean's explicit choice over a
-- traffic-only cut): who visits the app each day (`app_daily_visits`,
-- one row per user per Asia/Singapore calendar day, incremented on every
-- page view) and what they do (`action_events`, a generic log instrumented
-- across every meaningful write path). Surfaced as a "recent entrants"
-- list on the admin Overview and a per-person daily activity timeline on
-- the Users drill-down. Deliberately not built here, per the spec's own
-- §7 deferrals: no raw per-page-path logging, no retention/pruning, no
-- contact-info/outreach mechanism, no changes to Vercel Analytics.

create table if not exists app_daily_visits (
  user_id uuid not null references auth.users(id),
  visit_date date not null,
  page_view_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, visit_date)
);

create index if not exists app_daily_visits_visit_date_idx
  on app_daily_visits (visit_date desc);

alter table app_daily_visits enable row level security;

create policy "app_daily_visits_select" on app_daily_visits
  for select to authenticated using (user_id = auth.uid());
create policy "app_daily_visits_insert" on app_daily_visits
  for insert to authenticated with check (user_id = auth.uid());
create policy "app_daily_visits_update" on app_daily_visits
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists action_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists action_events_user_created_idx
  on action_events (user_id, created_at desc);
create index if not exists action_events_action_created_idx
  on action_events (action, created_at desc);

alter table action_events enable row level security;

create policy "action_events_select" on action_events
  for select to authenticated using (user_id = auth.uid());
create policy "action_events_insert" on action_events
  for insert to authenticated with check (user_id = auth.uid());

-- Atomic increment-on-conflict upsert for the page-view beacon.
-- SECURITY INVOKER, not DEFINER — unlike the admin-analytics functions
-- below, this only ever touches auth.uid()'s own row, which
-- `app_daily_visits_insert`/`_update` already allow; no elevated
-- privilege is needed to make the upsert atomic.
create or replace function track_daily_visit(p_visit_date date)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into app_daily_visits (user_id, visit_date, page_view_count, first_seen_at, last_seen_at)
  values (v_uid, p_visit_date, 1, now(), now())
  on conflict (user_id, visit_date)
  do update set
    page_view_count = app_daily_visits.page_view_count + 1,
    last_seen_at = now();
end;
$$;

grant execute on function track_daily_visit(date) to authenticated;

-- Fire-and-forget action-log write. Same SECURITY INVOKER reasoning as
-- track_daily_visit — only ever writes the caller's own row.
create or replace function log_action(p_action text, p_metadata jsonb default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into action_events (user_id, action, metadata)
  values (v_uid, p_action, p_metadata);
end;
$$;

grant execute on function log_action(text, jsonb) to authenticated;

-- ------------------------------------------------------------ get_admin_analytics --
-- Reproduces migration 065's function body in full (create or replace
-- replaces the whole thing — there is no way to patch just one key) and
-- adds one new top-level key, 'recentEntrants': who visited the app on
-- each of the last 7 days, regardless of `p_days`/`p_segment` — a fixed
-- trailing week, same reasoning `funnel` uses "today" rather than the
-- window. Sparse like `growth.newUsersDetail`: a day nobody visited has
-- no entry. Every other key is byte-for-byte unchanged from 065.
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

    -- New in this migration (Daily Activity Log) — the last 7 Asia/
    -- Singapore calendar days of app_daily_visits, independent of
    -- p_days/p_segment (a fixed trailing week, not the analytics window).
    'recentEntrants', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d, 'users', users) order by d desc), '[]'::jsonb)
      from (
        select
          v.visit_date as d,
          jsonb_agg(jsonb_build_object(
            'id', v.user_id, 'name', p.display_name, 'pageViews', v.page_view_count
          ) order by p.display_name) as users
        from app_daily_visits v
        join profiles p on p.user_id = v.user_id
        where v.visit_date >= ((now() at time zone 'Asia/Singapore')::date - interval '6 days')
        group by v.visit_date
      ) t
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

-- ------------------------------------------------------------ get_admin_user_detail --
-- Reproduces migration 064's function body in full, adding 'dailyActivity':
-- this person's last 30 Asia/Singapore calendar days, one entry per day
-- they visited the app at all. A day with a visit but no logged action
-- still appears, with an empty `actions` array — a day with no visit at
-- all is simply absent, not a zero-row. Every other key is unchanged.
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
    ),
    -- New in this migration (Daily Activity Log).
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
