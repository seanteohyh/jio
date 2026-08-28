-- 066_public_event_preview.sql
--
-- CHANGES_20260821_combined2.md §3A — a signed-out preview at `/e/[token]`
-- before the signup wall, same "unguessable token, SECURITY DEFINER
-- resolver, narrow column list" shape as `get_public_place`/
-- `get_public_lobang`. `lunch_events`/`event_options`/`event_rsvps` are all
-- `authenticated`-only in RLS (007_rls.sql) — a signed-out visitor has no
-- table privileges on any of them at all, so this has to bypass RLS
-- deliberately rather than being reachable by accident.
--
-- Resolved by `invite_token` only, never the raw id — same reasoning as
-- every other public-preview token in this app: a sequential/guessable id
-- would let a stranger enumerate other Jios, an unguessable token can't be.
--
-- Deliberately excludes votes, the tally, invitee identities, RSVP names,
-- and per-option vote counts/attribution — only a rough "going" headline
-- count and the place options as plain names. `hide_votes` (038) already
-- redacts this same data from *authenticated* participants while a Jio is
-- still open; a signed-out stranger gets at least that much redaction,
-- always, regardless of the host's own setting.
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
    )
  ) into v_result
  from lunch_events e
  left join profiles pr on pr.user_id = e.host_id
  where e.id = v_event_id;

  return v_result;
end;
$$;

grant execute on function get_public_event_preview(text) to anon, authenticated;
