-- 034_hidden_votes.sql
--
-- CHANGES_20260803_1.md §14: a host can start a Jio with the running
-- standing hidden from everyone (host included) while it's open — a
-- standard blind-poll pattern, so nobody bandwagons onto whatever option
-- is already leading.
--
-- Set only at creation, never editable after — a host-write-only setting
-- like the rest of a Jio's config, not a status-class field needing its
-- own gated function the way cancel/block do. The actual enforcement is
-- entirely at the API response layer (redactHiddenVotes in
-- src/lib/voting.ts, applied by every route that returns an EventDetail),
-- not here: RLS still lets a participant SELECT their own event_votes rows
-- directly, same as always, since restricting that would also break a
-- voter seeing their own submitted ballot confirmed. hide_votes is a
-- signal the application layer honours, not a database-level lock.

alter table lunch_events add column if not exists hide_votes boolean not null default false;
