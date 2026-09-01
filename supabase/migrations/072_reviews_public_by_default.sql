-- 072_reviews_public_by_default.sql
--
-- UX review log #19 — reviews flip from private-by-default to
-- public-by-default: visible to anyone viewing that place, unless the
-- reviewer opts to make it private. A real reversal of the original
-- private-by-default stance 004_visits.sql shipped with (and which an
-- earlier review specifically praised as good privacy practice) — a
-- deliberate product decision, not a bug fix, so flagged plainly rather
-- than folded in silently.
--
-- Every review already written flips too, not just new ones from here on
-- — there's no way to tell "written believing it was private" apart from
-- "written after this shipped" at the row level, and the decision was to
-- include existing rows rather than grandfather them. Read access is
-- already gated purely on `is_public` (007_rls.sql's `visits_select`
-- policy: `user_id = auth.uid() or is_public = true`), so flipping the
-- column is the whole fix — no RLS change needed here.

alter table visits alter column is_public set default true;

update visits set is_public = true where is_public = false;
