-- 090_event_option_notes.sql
--
-- A place-specific note visible to everyone voting — "opens at 12:30pm
-- instead" — distinct from a permanent fact about the place itself (that
-- belongs on `places`), just context for this one Jio. Only whoever added
-- the option may set or clear it, narrower than the existing delete policy
-- (host-or-adder) — a note is someone claiming to know something specific
-- about right now, not a moderation action.
--
-- No existing UPDATE policy covers event_options at all (the one existing
-- mutation, attaching a place to a free-text option, runs through the
-- security-definer `attach_place_to_option` function instead, see
-- 056_attach_place_to_option_participants.sql) — so a plain per-request
-- client update needs its own policy or it silently affects zero rows.

alter table event_options
  add column if not exists note text;

create policy "event_options_update_own_note" on event_options
  for update to authenticated
  using (added_by = auth.uid())
  with check (added_by = auth.uid());
