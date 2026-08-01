-- 028_place_edit_attribution.sql
--
-- Who touched a place last, and when. `updated_at` already existed on
-- `places` (002_places.sql) but nothing kept it current for a plain edit —
-- only the moderation functions in 017 ever set it by hand. `updated_by` is
-- new.
--
-- Both are set by a trigger, not trusted from the request body: a client
-- that can write `updated_by` can also lie about it, which makes the column
-- worse than not having one. Because column privileges only apply to columns
-- named in the client's own UPDATE statement, neither column needs to be
-- added to 027's grant — the trigger sets them on NEW regardless of what the
-- client's grant allows it to reference directly. Same pattern as
-- 026_walk_cache_invalidation.sql.
--
-- Not surfaced in the UI. Showing "last edited by Sean" adds social pressure
-- that would probably improve edit quality, but it also makes editing feel
-- observed — a product call worth making deliberately later, not as a side
-- effect of adding a column now.
--
-- Existing rows keep `updated_by` null rather than being backfilled: nobody
-- edited them, and a fake attribution is a worse answer than no answer.

alter table places add column if not exists updated_by uuid;

create or replace function stamp_place_edit()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_stamp_place_edit on places;
create trigger trg_stamp_place_edit
  before update on places
  for each row
  execute function stamp_place_edit();
