-- 020_onboarding.sql
-- A single one-time /welcome screen for new users, capturing name/nickname
-- only. `onboarded_at` null is what gates the redirect there — existing
-- users are backfilled to `now()` here so nobody sees it retroactively.
-- See CHANGELOG_20260729.md, "Onboarding welcome screen".

alter table profiles add column if not exists onboarded_at timestamptz;

update profiles set onboarded_at = created_at
where onboarded_at is null;
