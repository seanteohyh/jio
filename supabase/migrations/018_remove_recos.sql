-- 018_remove_recos.sql
--
-- Reco (the "Food Pool") is removed. Lobang now covers the same underlying
-- need — a teammate telling you about a place — strictly better: it has a
-- real recipient, a persistent inbox, and (eventually) a push notification,
-- where Reco was an easy-to-scroll-past ambient feed nobody got notified
-- about. See CHANGELOG_20260729.md, "Reco (Food Pool) removed" for the full
-- reasoning.
--
-- 009_recos.sql is left in place as a historical record rather than edited
-- in place — this repo's migrations are additive/idempotent, so an already
-- -applied install needs a real DROP, not a rewritten CREATE that Postgres
-- would silently no-op against an existing table.

drop policy if exists "recos_select" on recos;
drop policy if exists "recos_insert" on recos;
drop policy if exists "recos_update" on recos;
drop policy if exists "recos_delete" on recos;

drop table if exists recos cascade;
