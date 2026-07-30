-- 013_event_invitees.sql
-- Explicit invitees, for events that are not tied to a kaki group.
--
-- Also replaces the host-only insert policy on event_options with a
-- participant-scoped one, so the people actually coming to lunch can suggest
-- where to eat.

create table if not exists event_invitees (
  event_id uuid not null references lunch_events(id) on delete cascade,
  user_id  uuid not null,
  primary key (event_id, user_id)
);

create index if not exists event_invitees_user_idx on event_invitees (user_id);

alter table event_invitees enable row level security;

-- You can see your own invitation; the host can see all of them.
drop policy if exists "event_invitees_select" on event_invitees;
create policy "event_invitees_select" on event_invitees
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

drop policy if exists "event_invitees_insert" on event_invitees;
create policy "event_invitees_insert" on event_invitees
  for insert to authenticated with check (
    exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

drop policy if exists "event_invitees_delete" on event_invitees;
create policy "event_invitees_delete" on event_invitees
  for delete to authenticated using (
    exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

-- ------------------------------------------------- event_options, revised --
-- Who may add a place option: the host, a member of the linked kaki, or
-- someone explicitly invited — and only while the event is still open.
--
-- This is the authoritative check. supabaseRepo.addOptionToEvent() runs the
-- same logic in application code purely so the user gets a readable message
-- instead of a bare policy violation.
drop policy if exists "event_options_insert" on event_options;
create policy "event_options_insert_participant" on event_options
  for insert to authenticated with check (
    added_by = auth.uid()
    and exists (
      select 1 from lunch_events e
      where e.id = event_id
        and e.status = 'open'
        and (
          e.host_id = auth.uid()
          or (e.kaki_id is not null and exists (
            select 1 from kaki_members m
            where m.kaki_id = e.kaki_id and m.user_id = auth.uid()
          ))
          or exists (
            select 1 from event_invitees i
            where i.event_id = e.id and i.user_id = auth.uid()
          )
        )
    )
  );

-- The host can remove anything; everyone else can remove only what they added.
drop policy if exists "event_options_delete" on event_options;
create policy "event_options_delete" on event_options
  for delete to authenticated using (
    added_by = auth.uid()
    or exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );
