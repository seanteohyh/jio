-- 088_vote_deadline.sql
--
-- Vote-deadline auto-close. Confirmed bug: a Jio auto-closed
-- (maybeAutoCloseEvent) once 2 of 4 invited people had RSVP'd yes and
-- voted, even though the other 2 were invited from the start and never
-- got a chance to respond — the likely mechanism is a race between an
-- "invite more people" request and a vote-triggered close-check landing
-- on two different connections, each seeing a different snapshot of
-- event_invitees. Rather than chase that race in isolation, this replaces
-- "wait for full consensus, indefinitely" with a bounded model: a
-- host-set vote deadline (default 3h before the Jio's own start time)
-- that force-closes the Jio once it passes, regardless of who's still
-- pending — on top of, not instead of, today's "closes the moment
-- everyone's answered" behavior, which stays exactly as it is (see the
-- application-level hardening applied alongside this migration).
--
-- No new SQL function needed for the cron-triggered pieces (closing past
-- the deadline, claiming the "closes soon" reminder) — both run from the
-- service-role client, same as maybeAutoCloseEvent's own closing write
-- already does, which bypasses RLS entirely. `lunch_events_update`
-- (007_rls.sql) already covers the host-driven writes (reschedule, the
-- deadline edit) with no column-level restriction (024_flexi_jio.sql's
-- own comment confirms new columns need no new policy).

alter table lunch_events
  add column if not exists vote_deadline_offset_minutes integer,
  add column if not exists vote_end_at timestamptz,
  add column if not exists vote_deadline_reminder_sent_at timestamptz;

-- Partial index — the cron sweep only ever queries open Jios with a
-- deadline set, so there's no reason to index the (usually larger) set of
-- closed/cancelled/no-deadline rows.
create index if not exists lunch_events_vote_end_at_idx
  on lunch_events (vote_end_at)
  where status = 'open' and vote_end_at is not null;

alter table recurring_series
  add column if not exists vote_deadline_offset_minutes integer default 180;

-- Reproduces 080_event_notes.sql's function body in full (create or
-- replace replaces the whole thing), adding 'voteEndAt' so a shared link
-- tells a signed-out invitee there's a clock before they sign in to vote.
create or replace function get_public_event_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_result jsonb;
begin
  select id into v_event_id from lunch_events where invite_token = p_token;
  if v_event_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'title', e.title,
    'hostName', coalesce(pr.display_name, 'A teammate'),
    'scheduledAt', e.scheduled_at,
    'datePhase', e.date_phase,
    'status', e.status,
    'notes', e.notes,
    'voteEndAt', e.vote_end_at,
    'goingCount', (
      select count(*) from event_rsvps
      where event_id = v_event_id and response = 'yes'
    ),
    'placeOptions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', eo.place_id,
        'name', coalesce(p.name, eo.label, 'A place')
      )), '[]'::jsonb)
      from event_options eo
      left join places p on p.id = eo.place_id
      where eo.event_id = v_event_id
    ),
    'winnerPlaceName', case
      when e.status = 'closed' and e.winner_place_id is not null then coalesce(
        (select name from places where id = e.winner_place_id),
        (select label from event_options
          where event_id = v_event_id and place_id = e.winner_place_id)
      )
      else null
    end
  ) into v_result
  from lunch_events e
  left join profiles pr on pr.user_id = e.host_id
  where e.id = v_event_id;

  return v_result;
end;
$$;

grant execute on function get_public_event_preview(text) to anon, authenticated;
