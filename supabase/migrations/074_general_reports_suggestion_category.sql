-- 074_general_reports_suggestion_category.sql
--
-- A "Give feedback" entry point on Home (not just "Report a problem" on
-- Profile) reuses the same general_reports pipeline (073) rather than a
-- second table — same "anyone can file, an admin resolves it later" shape,
-- just a new category so a suggestion doesn't get mislabelled as a bug
-- report in the admin queue.

alter table general_reports drop constraint if exists general_reports_category_check;
alter table general_reports add constraint general_reports_category_check
  check (category in ('not_working', 'place_wrong', 'suggestion', 'other'));
