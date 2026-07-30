-- 014_indexes.sql
-- Indexes on the paths the app actually hits on every page load.
--
-- Cheap insurance: the Supabase free tier gives you limited compute, and an
-- unindexed sequential scan over visits is what will eat it first.

-- The recommender loads every active place, filtered by budget and location.
create index if not exists places_budget_idx on places (budget_tier);
create index if not exists places_latlng_idx on places (lat, lng);
create index if not exists places_created_by_idx on places (created_by);

-- Rating aggregates group visits by place; the metrics pages group by user.
create index if not exists visits_place_user_idx on visits (place_id, user_id);
create index if not exists visits_public_idx on visits (place_id)
  where is_public = true;

-- Event listing walks these four tables by user_id on every /events load.
create index if not exists event_options_event_idx on event_options (event_id);
create index if not exists event_votes_event_idx on event_votes (event_id);
create index if not exists event_rsvps_event_idx on event_rsvps (event_id);
create index if not exists event_invitees_event_idx on event_invitees (event_id);

-- Invite-link resolution.
create index if not exists lunch_events_token_idx on lunch_events (invite_token);
create index if not exists kakis_token_idx on kakis (invite_token);

-- Kaki group stats join members to their visits.
create index if not exists kaki_members_kaki_idx on kaki_members (kaki_id);

-- The Food Pool feed is ordered by recency.
create index if not exists recos_place_user_idx on recos (place_id, user_id);
