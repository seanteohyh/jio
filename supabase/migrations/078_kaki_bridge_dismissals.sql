-- 078_kaki_bridge_dismissals.sql
--
-- "Turn this into a Kaki?" — the host of a decided Jio, if the exact
-- group of people involved doesn't already share a Kaki, gets a one-time
-- prompt to formalize it into one. Same per-(user, event) row shape as
-- `decided_celebration_views` (070), but this one is host-only and only
-- ever gets set by an explicit dismiss — accepting the suggestion
-- (creating a Kaki) doesn't write here at all: it naturally stops
-- qualifying instead, since the new Kaki's member set then matches.

create table if not exists kaki_bridge_dismissals (
  user_id      uuid not null,
  event_id     uuid not null references lunch_events(id) on delete cascade,
  dismissed_at timestamptz default now(),
  primary key (user_id, event_id)
);

create index if not exists kaki_bridge_dismissals_user_idx
  on kaki_bridge_dismissals (user_id);

alter table kaki_bridge_dismissals enable row level security;

-- Owner-only, same reasoning as decided_celebration_views: whether you've
-- personally dismissed this prompt is not anyone else's business.
drop policy if exists "kaki_bridge_dismissals_select" on kaki_bridge_dismissals;
create policy "kaki_bridge_dismissals_select" on kaki_bridge_dismissals
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "kaki_bridge_dismissals_insert" on kaki_bridge_dismissals;
create policy "kaki_bridge_dismissals_insert" on kaki_bridge_dismissals
  for insert to authenticated with check (user_id = auth.uid());
