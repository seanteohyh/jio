-- 054_co_attendance.sql
--
-- CHANGES_20260818.md §3 / docs/user-discovery.md §4.2 — ranks the
-- teammate pickers by co-attendance instead of alphabetically. Needs a
-- SECURITY DEFINER function for a reason distinct from most others in this
-- schema: `event_invitees_select` (013_event_invitees.sql) only lets a
-- session see its own invitee row, or every row on an event it hosts.
-- Scoring "who else was at the Jios I've been to" means reading *other*
-- people's invitee rows on events the caller didn't host — exactly the
-- kind of cross-row read RLS is deliberately built to refuse to a plain
-- client-side query, same shape as `get_push_targets`/`is_lobang_recipient`
-- before it.

create or replace function get_co_attendance_scores(
  p_user_id uuid,
  p_half_life_days numeric default 30
)
returns table (user_id uuid, score numeric)
language sql
security definer
set search_path = public
stable
as $$
  with my_events as (
    select e.id, e.scheduled_at, e.host_id
    from lunch_events e
    where e.host_id = p_user_id
       or exists (
         select 1 from event_invitees i
         where i.event_id = e.id and i.user_id = p_user_id
       )
  ),
  -- Every other participant (host + invitees) on each of those events,
  -- one row per (event, other person).
  participants as (
    select me.id as event_id, me.scheduled_at, me.host_id as other_user_id
    from my_events me
    where me.host_id <> p_user_id
    union all
    select me.id, me.scheduled_at, i.user_id
    from my_events me
    join event_invitees i on i.event_id = me.id
    where i.user_id <> p_user_id
  )
  select
    other_user_id as user_id,
    -- A future-dated Jio counts at full weight (greatest(...,0)) rather
    -- than a negative days-ago blowing the exponential up.
    sum(
      exp(
        -greatest(extract(epoch from (now() - scheduled_at)) / 86400.0, 0)
        / p_half_life_days
      )
    ) as score
  from participants
  group by other_user_id;
$$;

grant execute on function get_co_attendance_scores(uuid, numeric) to authenticated;

-- ----------------------------------------------------------------- sanity check ---
-- Read after running. Must return exactly one row.

select proname from pg_proc where proname = 'get_co_attendance_scores';
