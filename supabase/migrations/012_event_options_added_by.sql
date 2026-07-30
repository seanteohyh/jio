-- 012_event_options_added_by.sql
-- Records who put each option on the table.
--
-- Needed for two things: showing "added by Alex" in the UI, and letting people
-- remove their own suggestion without giving them the power to remove
-- everyone else's.

alter table event_options
  add column if not exists added_by uuid;

-- Backfill existing rows to the event host — before this column existed, only
-- the host could add options, so that is historically accurate.
update event_options o
set added_by = e.host_id
from lunch_events e
where o.event_id = e.id
  and o.added_by is null;

-- Only enforce NOT NULL once nothing is null, so re-running is safe.
do $$
begin
  if not exists (
    select 1 from event_options where added_by is null
  ) then
    begin
      alter table event_options alter column added_by set not null;
    exception when others then
      -- Already not-null. Nothing to do.
      null;
    end;
  end if;
end $$;

create index if not exists event_options_added_by_idx
  on event_options (added_by);
