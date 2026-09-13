-- 087_page_views_by_tab.sql
--
-- Traffic by page — the admin analytics dashboard's Performance tab used
-- to explicitly defer this ("Page views, unique visitors... live in
-- Vercel's own dashboard instead"), since Vercel's own analytics has no
-- concept of this app's internal tabs anyway. New request: a per-day
-- table, one row per `BottomNav` section (Home/Jios/Kakis/Places/Map/You,
-- plus Admin/Other), with page views (PV) and unique visitors (UV).
--
-- Same increment-on-conflict shape as `app_daily_visits` (076), one row
-- per (user_id, visit_date, tab) instead of per (user_id, visit_date) —
-- `on delete cascade` this time, learning from 086: `app_daily_visits`/
-- `action_events` originally had a hard FK to auth.users with no cascade,
-- which silently blocked `admin.auth.admin.deleteUser()` on any account
-- merge once that account had ever visited the app. Not repeating that
-- here.

create table if not exists page_views_by_tab (
  user_id uuid not null references auth.users(id) on delete cascade,
  visit_date date not null,
  tab text not null,
  page_view_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, visit_date, tab)
);

create index if not exists page_views_by_tab_date_idx
  on page_views_by_tab (visit_date desc);

alter table page_views_by_tab enable row level security;

create policy "page_views_by_tab_select" on page_views_by_tab
  for select to authenticated using (user_id = auth.uid());
create policy "page_views_by_tab_insert" on page_views_by_tab
  for insert to authenticated with check (user_id = auth.uid());
create policy "page_views_by_tab_update" on page_views_by_tab
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Same SECURITY INVOKER reasoning as track_daily_visit (076) — only ever
-- writes the caller's own row, which the policies above already allow.
create or replace function track_page_view(p_visit_date date, p_tab text)
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

  insert into page_views_by_tab (user_id, visit_date, tab, page_view_count, first_seen_at, last_seen_at)
  values (v_uid, p_visit_date, p_tab, 1, now(), now())
  on conflict (user_id, visit_date, tab)
  do update set
    page_view_count = page_views_by_tab.page_view_count + 1,
    last_seen_at = now();
end;
$$;

grant execute on function track_page_view(date, text) to authenticated;

-- ------------------------------------------------------------ get_admin_analytics --
-- Reproduces migration 076's function body in full (create or replace
-- replaces the whole thing) and adds one new top-level key,
-- 'pageViewsByTab': the trailing 14 days of PV (sum of page_view_count)
-- and UV (distinct user_id count) per tab, independent of p_days/p_segment
-- — same "today/this stretch, not the window" reasoning 'recentEntrants'
-- already uses. Every other key is byte-for-byte unchanged from 076.
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

    -- New in this migration (traffic by page). Trailing 14 days, sparse:
    -- a tab with no views on a given day is simply omitted from that
    -- day's list.
    'pageViewsByTab', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d, 'tabs', tabs) order by d desc), '[]'::jsonb)
      from (
        select
          visit_date as d,
          jsonb_agg(jsonb_build_object(
            'tab', tab, 'pv', pv, 'uv', uv
          ) order by pv desc) as tabs
        from (
          select
            visit_date,
            tab,
            sum(page_view_count) as pv,
            count(distinct user_id) as uv
          from page_views_by_tab
          where visit_date >= ((now() at time zone 'Asia/Singapore')::date - interval '13 days')
          group by visit_date, tab
        ) agg
        group by visit_date
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

-- ------------------------------------------------------------ merge_user_accounts --
-- Reproduces migration 086's function body in full, adding page_views_by_tab
-- to the same "merge same-key counts, carry the rest forward" handling
-- app_daily_visits already gets — same FK-to-auth.users shape (this one
-- already `on delete cascade`, so it isn't a repeat of 086's actual bug,
-- but a merge should still carry a merged-in account's page-view history
-- forward onto the survivor rather than silently losing it on cascade).
create or replace function merge_user_accounts(
  p_keep_user_id uuid,
  p_merge_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_merge_created_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_keep_user_id is null or p_merge_user_id is null then
    raise exception 'Both accounts are required';
  end if;
  if p_keep_user_id = p_merge_user_id then
    raise exception 'Cannot merge an account into itself';
  end if;

  select exists(select 1 from admins where user_id = v_uid) into v_is_admin;

  if v_uid is distinct from p_keep_user_id and not v_is_admin then
    raise exception 'You may only merge another account into your own';
  end if;

  update lunch_events set host_id = p_keep_user_id
    where host_id = p_merge_user_id;

  update kakis set created_by = p_keep_user_id
    where created_by = p_merge_user_id;

  delete from event_votes ev
    where ev.user_id = p_merge_user_id
      and exists (
        select 1 from event_votes ek
        where ek.event_id = ev.event_id
          and ek.place_id = ev.place_id
          and ek.user_id = p_keep_user_id
      );
  update event_votes set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  delete from event_rsvps er
    where er.user_id = p_merge_user_id
      and exists (
        select 1 from event_rsvps ek
        where ek.event_id = er.event_id and ek.user_id = p_keep_user_id
      );
  update event_rsvps set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  delete from event_invitees ei
    where ei.user_id = p_merge_user_id
      and exists (
        select 1 from event_invitees ek
        where ek.event_id = ei.event_id and ek.user_id = p_keep_user_id
      );
  update event_invitees set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  delete from kaki_members km
    where km.user_id = p_merge_user_id
      and exists (
        select 1 from kaki_members kk
        where kk.kaki_id = km.kaki_id and kk.user_id = p_keep_user_id
      );
  update kaki_members set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  delete from wishlist w
    where w.user_id = p_merge_user_id
      and exists (
        select 1 from wishlist wk
        where wk.place_id = w.place_id and wk.user_id = p_keep_user_id
      );
  update wishlist set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  update visits set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  update push_subscriptions set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  if not exists (select 1 from user_prefs where user_id = p_keep_user_id) then
    update user_prefs set user_id = p_keep_user_id
      where user_id = p_merge_user_id;
  else
    delete from user_prefs where user_id = p_merge_user_id;
  end if;

  if exists (select 1 from admins where user_id = p_merge_user_id) then
    if not exists (select 1 from admins where user_id = p_keep_user_id) then
      insert into admins (user_id, granted_by, granted_at)
      select p_keep_user_id, granted_by, granted_at
      from admins where user_id = p_merge_user_id;
    end if;
    delete from admins where user_id = p_merge_user_id;
  end if;

  update app_daily_visits keep
    set page_view_count = keep.page_view_count + merged.page_view_count,
        first_seen_at = least(keep.first_seen_at, merged.first_seen_at),
        last_seen_at = greatest(keep.last_seen_at, merged.last_seen_at)
    from app_daily_visits merged
    where merged.user_id = p_merge_user_id
      and keep.user_id = p_keep_user_id
      and keep.visit_date = merged.visit_date;

  delete from app_daily_visits adv
    where adv.user_id = p_merge_user_id
      and exists (
        select 1 from app_daily_visits k
        where k.user_id = p_keep_user_id and k.visit_date = adv.visit_date
      );

  update app_daily_visits set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  update action_events set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  update admin_engagement_weights set updated_by = p_keep_user_id
    where updated_by = p_merge_user_id;

  -- page_views_by_tab (087) — same merge-same-key-counts shape as
  -- app_daily_visits above, keyed on (user_id, visit_date, tab).
  update page_views_by_tab keep
    set page_view_count = keep.page_view_count + merged.page_view_count,
        first_seen_at = least(keep.first_seen_at, merged.first_seen_at),
        last_seen_at = greatest(keep.last_seen_at, merged.last_seen_at)
    from page_views_by_tab merged
    where merged.user_id = p_merge_user_id
      and keep.user_id = p_keep_user_id
      and keep.visit_date = merged.visit_date
      and keep.tab = merged.tab;

  delete from page_views_by_tab pvt
    where pvt.user_id = p_merge_user_id
      and exists (
        select 1 from page_views_by_tab k
        where k.user_id = p_keep_user_id
          and k.visit_date = pvt.visit_date
          and k.tab = pvt.tab
      );

  update page_views_by_tab set user_id = p_keep_user_id
    where user_id = p_merge_user_id;

  select created_at into v_merge_created_at
    from profiles where user_id = p_merge_user_id;

  if v_merge_created_at is not null then
    update profiles
      set created_at = least(created_at, v_merge_created_at)
      where user_id = p_keep_user_id;
  end if;
end;
$$;

grant execute on function merge_user_accounts(uuid, uuid) to authenticated;
