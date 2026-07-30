-- 006_events.sql
-- A "Jio": one lunch outing, its candidate places, its ranked ballots and its
-- RSVPs.

create table if not exists lunch_events (
  id              uuid primary key default gen_random_uuid(),
  office_id       uuid,
  host_id         uuid,
  title           text,
  scheduled_at    timestamptz,
  status          text default 'open'
                    check (status in ('open', 'closed', 'cancelled')),
  -- Unguessable slug for share links. Possession of it is the invite.
  invite_token    text unique default gen_random_uuid()::text,
  winner_place_id uuid references places(id),
  created_at      timestamptz default now()
);

create index if not exists lunch_events_host_idx on lunch_events (host_id);
create index if not exists lunch_events_office_idx on lunch_events (office_id);
create index if not exists lunch_events_scheduled_idx
  on lunch_events (scheduled_at desc);

create table if not exists event_options (
  event_id uuid not null references lunch_events(id) on delete cascade,
  place_id uuid not null references places(id),
  primary key (event_id, place_id)
);

-- One row per (voter, option). rank 1 is the voter's first choice.
-- The composite PK means a voter cannot rank the same place twice.
create table if not exists event_votes (
  event_id   uuid not null references lunch_events(id) on delete cascade,
  user_id    uuid not null,
  place_id   uuid not null,
  rank       smallint not null check (rank >= 1),
  created_at timestamptz default now(),
  primary key (event_id, user_id, place_id)
);

create index if not exists event_votes_user_idx on event_votes (user_id);
create index if not exists event_votes_created_idx on event_votes (created_at desc);

create table if not exists event_rsvps (
  event_id uuid not null references lunch_events(id) on delete cascade,
  user_id  uuid not null,
  response text check (response in ('yes', 'no', 'maybe')),
  primary key (event_id, user_id)
);

create index if not exists event_rsvps_user_idx on event_rsvps (user_id);
