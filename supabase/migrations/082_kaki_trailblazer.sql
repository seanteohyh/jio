-- 082_kaki_trailblazer.sql
--
-- A third Kaki food-identity award slot, alongside `most_active_*`/
-- `adventurer_*`: the member with the most places in their own history
-- that no other member has been to. `mostActive`/`adventurer` both tend
-- to go to whoever simply eats out the most; this rewards genuinely
-- bringing the group somewhere new, even at low volume — see
-- `KakiMetrics.trailblazer`'s own doc comment in src/types/index.ts.

alter table kaki_food_identity_snapshots
  add column if not exists trailblazer_user_id uuid,
  add column if not exists trailblazer_unique_places int;
