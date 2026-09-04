-- 080_event_notes.sql
--
-- A free-text field the host fills in at creation ("parking is at the back",
-- "bring your own utensils", whatever doesn't fit a place name or a date) —
-- shown to every invitee, including a signed-out visitor at the /e/[token]
-- preview. Set once at creation, same as `hide_votes`; no edit path exists
-- (unlike a reschedule or a corrected winner, this isn't a mistake to fix,
-- just a plain field the form collects).

alter table lunch_events add column if not exists notes text;

-- Reproduces 070_decided_celebration_views.sql's function body in full
-- (create or replace replaces the whole thing), adding 'notes' to the
-- signed-out preview so an invitee who hasn't signed up yet still sees it.
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
