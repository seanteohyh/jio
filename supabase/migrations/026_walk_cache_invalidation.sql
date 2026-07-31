-- 026_walk_cache_invalidation.sql
--
-- Drop cached walking times whenever the thing they were measured between
-- moves.
--
-- `walk_cache` stores one row per (office, place) pair and was designed to be
-- written once and kept forever, on the reasonable grounds that streets do not
-- move. Buildings do, though — or rather, the coordinates we hold for them get
-- corrected — and until now nothing noticed. A wrong office pin silently
-- poisoned every walk time in the app; the fix was to remember to clear the
-- table by hand, which is exactly the kind of thing nobody remembers the second
-- time.
--
-- Now that any signed-in user can edit a place (including dragging its
-- location), this stops being an occasional migration chore and becomes a
-- thing that happens quietly, one row at a time, with nobody watching.
--
-- Deleting rather than recomputing is deliberate. `/places` sorts on
-- walk_minutes with NULLS LAST, so a place with no cached time sorts to the
-- bottom and reads as "we don't know yet" — honest. A stale number reads as
-- fact. Run `npm run seed:walktimes` to refill; it skips pairs that are
-- already cached, so it only computes what this trigger removed.
--
-- Same pattern as 021_place_ratings_trigger.sql: row-level, always current,
-- no schedule, no staleness window.

-- --------------------------------------------------------------- places ----

create or replace function invalidate_walk_cache_for_place()
returns trigger
language plpgsql
as $$
begin
  if new.lat is distinct from old.lat or new.lng is distinct from old.lng then
    delete from walk_cache where place_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_place_moved on places;
create trigger trg_place_moved
  after update of lat, lng on places
  for each row
  execute function invalidate_walk_cache_for_place();

-- -------------------------------------------------------------- offices ----

create or replace function invalidate_walk_cache_for_office()
returns trigger
language plpgsql
as $$
begin
  if new.lat is distinct from old.lat or new.lng is distinct from old.lng then
    delete from walk_cache where office_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_office_moved on offices;
create trigger trg_office_moved
  after update of lat, lng on offices
  for each row
  execute function invalidate_walk_cache_for_office();
