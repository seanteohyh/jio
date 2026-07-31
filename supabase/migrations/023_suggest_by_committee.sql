-- 023_suggest_by_committee.sql
-- "Can't decide? Suggest 3" — auto-adds candidates straight into
-- event_options rather than a separate preview/confirm step. Reuses the
-- existing recommendation engine (groupRecommend, bayesianRating) instead of
-- new scoring, and the existing event_options RLS policy from
-- 013_event_invitees.sql already covers who may insert these (same rule as
-- a manual add: added_by = the requester, who must be host/kaki-member/
-- invitee). See CHANGELOG_20260729.md, "Suggest by Committee".

alter table event_options add column if not exists is_suggested boolean not null default false;
