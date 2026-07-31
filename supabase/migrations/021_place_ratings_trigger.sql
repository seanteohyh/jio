-- 021_place_ratings_trigger.sql
--
-- Rating aggregates move from "computed in the app on every read" to
-- trigger-maintained columns, recomputed only for the one affected place on
-- each visits insert/update/delete. Always current, no refresh schedule, no
-- staleness window — and /suggest stops needing a full visits fetch just to
-- rank places. See CHANGELOG_20260729.md, "Place ratings — trigger-
-- maintained columns".

alter table places add column if not exists avg_rating numeric;
alter table places add column if not exists visit_count integer not null default 0;
alter table places add column if not exists rating_updated_at timestamptz;

create or replace function recompute_place_rating(p_place_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update places
  set
    avg_rating = (
      select avg(rating) from visits
      where place_id = p_place_id and rating is not null
    ),
    visit_count = (
      select count(*) from visits where place_id = p_place_id
    ),
    rating_updated_at = now()
  where id = p_place_id;
end;
$$;

create or replace function visits_rating_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform recompute_place_rating(old.place_id);
    return old;
  end if;

  perform recompute_place_rating(new.place_id);

  -- An update can change which place a visit belongs to (unlikely, but the
  -- old place's aggregate would otherwise go stale if it did).
  if (tg_op = 'UPDATE' and old.place_id is distinct from new.place_id) then
    perform recompute_place_rating(old.place_id);
  end if;

  return new;
end;
$$;

drop trigger if exists visits_rating_trigger on visits;
create trigger visits_rating_trigger
  after insert or update or delete on visits
  for each row execute function visits_rating_trigger();

-- Backfill existing installs — every place with visits already logged needs
-- its aggregate computed once, rather than waiting for the next visit.
do $$
declare
  p record;
begin
  for p in select id from places loop
    perform recompute_place_rating(p.id);
  end loop;
end $$;
