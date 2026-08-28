-- 067_first_decided_celebration.sql
--
-- CHANGES_20260821_combined2.md §3D — a one-time celebration, distinct from
-- the everyday "Decided" card every Jio's page already shows once closed
-- (see /events/[id]/page.tsx), tied to an account's first-ever experience
-- of a Jio they RSVP'd (any response) and voted on reaching that decided
-- state. Same one-shot shape as `onboarded_at` (migration 011): null forever
-- after means it never fires again.
--
-- Deliberately not "the chronologically earliest such Jio" — it fires the
-- next time this account visits *any* qualifying decided Jio's page while
-- this column is still null, which also covers someone who never had the
-- page open at the live close (auto-close, or the host closing it), not
-- just the one who happened to be watching.

alter table profiles
  add column if not exists first_decided_celebration_shown_at timestamptz;

-- profiles_select (007_rls.sql) is row-level (`using (true)`), but SELECT
-- itself is column-restricted since 041_recovery_links.sql — a new column
-- needs its own grant, or it's silently unreadable rather than just
-- omitted. UPDATE has no such column restriction (profiles_update, same
-- migration as the table), so no update grant is needed here.
grant select (first_decided_celebration_shown_at) on profiles to authenticated;
