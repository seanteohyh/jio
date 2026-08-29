-- 070_decided_celebration_views.sql
--
-- UX review log #25 — generalises the one-time "first decided Jio"
-- celebration (migration 067) from "the very first qualifying Jio this
-- account ever sees, account-wide, once" to every decided Jio getting its
-- own celebration the first time its viewer sees it. A single `profiles`
-- column can only ever record one flag for the whole account; this needs a
-- per-(user, event) row instead, same shape as `wishlist` (008_wishlist.sql).

create table if not exists decided_celebration_views (
  user_id  uuid not null,
  event_id uuid not null references lunch_events(id) on delete cascade,
  shown_at timestamptz default now(),
  primary key (user_id, event_id)
);

create index if not exists decided_celebration_views_user_idx
  on decided_celebration_views (user_id);

alter table decided_celebration_views enable row level security;

-- Owner-only, same reasoning as wishlist: whether you've personally seen a
-- celebration is not anyone else's business.
drop policy if exists "decided_celebration_views_select" on decided_celebration_views;
create policy "decided_celebration_views_select" on decided_celebration_views
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "decided_celebration_views_insert" on decided_celebration_views;
create policy "decided_celebration_views_insert" on decided_celebration_views
  for insert to authenticated with check (user_id = auth.uid());

-- Superseded by the table above — every decided Jio now gets its own row
-- instead of one shared once-ever column.
alter table profiles drop column if exists first_decided_celebration_shown_at;

-- UX review log #25 — the `/e/[token]` signed-out preview now surfaces the
-- decided place once a Jio has closed, rather than staying written for a
-- vote that's no longer relevant. Same function as 066_public_event_preview.sql,
-- extended with one more field; the winner-name derivation mirrors
-- `getEvent`'s own in demoRepo.ts/supabaseRepo.ts (a real place's name, or
-- the free-text option's label if the winner has no `places` row).
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
