-- 091_options_changed_at.sql
--
-- Bug report item 4: a confirmed race where a Jio auto-closed on 2 of 4
-- invited people's votes while the other 2 were invited from the start and
-- never got a chance to respond (item 4's own motivating report is the
-- opposite direction of the same problem — a *new* place added mid-vote
-- shouldn't let stale ballots silently carry an auto-close through either).
-- `options_changed_at` is bumped to "now" whenever a place option is added;
-- `maybeAutoCloseEvent`'s full-consensus check treats any yes-RSVP'd
-- participant whose ballot predates this timestamp as not-yet-voted. The
-- vote-deadline sweep (closeEventsPastVoteDeadline) is deliberately
-- unaffected — it closes with whatever ballots exist regardless of
-- staleness, per the report ("if deadline reaches, use old votes").
--
-- SECURITY DEFINER because whoever adds a place isn't necessarily the host
-- — same reasoning as claim_vote_push_window (038_vote_push_throttle.sql):
-- lunch_events_update (007_rls.sql) only allows the host to write to
-- lunch_events. No internal permission check, same as that function — this
-- is only ever called right after a place-option insert that was itself
-- already gated by the event_options_insert_participant RLS policy.

alter table lunch_events
  add column if not exists options_changed_at timestamptz;

create or replace function bump_options_changed_at(p_event_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update lunch_events
  set options_changed_at = now()
  where id = p_event_id;
$$;

grant execute on function bump_options_changed_at(uuid) to authenticated;
