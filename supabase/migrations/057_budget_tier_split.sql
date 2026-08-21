-- 057_budget_tier_split.sql
-- CHANGES_20260821.md §1 — the old flat tier 4 ("over $30") was too coarse.
-- Split into three: 4 = $30-50, 5 = $50-100, 6 = over $100. Tiers 1-3 are
-- unchanged. No data migration needed: every existing tier-4 place keeps its
-- numeric tier (4) unchanged, which is exactly what carries it over to the
-- new $30-50 band as the safe default — there's no stored price to re-derive
-- a better answer from, since discovery has never assigned tier 4
-- automatically (see budgetByAmenity in src/lib/discovery.ts). Some of those
-- places were likely actually $50+ or $100+; flagged for a manual re-check
-- pass by humans, not something this migration can resolve on its own.

alter table places drop constraint if exists places_budget_tier_check;
alter table places add constraint places_budget_tier_check
  check (budget_tier between 1 and 6);

alter table user_prefs alter column budget_max set default 6;
