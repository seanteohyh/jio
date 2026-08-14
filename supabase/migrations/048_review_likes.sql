-- 048_review_likes.sql
-- CHANGES_20260814.md §3: a lightweight "like" on place reviews, plus the
-- push notification that makes it a reinforcement loop rather than just
-- decoration. Weekly recap (also decided in §3) reads this table directly
-- from the cron route rather than needing anything new here.
--
-- One narrow table, not the polymorphic target_type/target_id shape first
-- floated in the brainstorm — only reviews are in scope, matching how
-- add_kaki_member/get_public_place are each scoped to exactly one thing
-- rather than built generic ahead of a second use case that isn't decided
-- yet (liking "who added a place" stays unselected — see the log).

create table if not exists review_likes (
  visit_id   uuid not null references visits(id) on delete cascade,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (visit_id, user_id)
);

create index if not exists review_likes_visit_idx on review_likes (visit_id);

alter table review_likes enable row level security;

-- Own likes only, both ways — matches wishlist's fully-private shape
-- (008_wishlist.sql). No one gets a "liked by" list; the aggregate count
-- lives on `visits.like_count` below, not read from this table directly.
drop policy if exists "review_likes_select" on review_likes;
create policy "review_likes_select" on review_likes
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "review_likes_insert" on review_likes;
create policy "review_likes_insert" on review_likes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "review_likes_delete" on review_likes;
create policy "review_likes_delete" on review_likes
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- like_count — trigger-maintained, same shape as avg_rating/visit_count on
-- places (021_place_ratings_trigger.sql). Never a live aggregate query.

alter table visits add column if not exists like_count integer not null default 0;

create or replace function recompute_review_like_count(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update visits
  set like_count = (
    select count(*) from review_likes where visit_id = p_visit_id
  )
  where id = p_visit_id;
end;
$$;

create or replace function review_likes_count_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform recompute_review_like_count(old.visit_id);
    return old;
  end if;

  perform recompute_review_like_count(new.visit_id);
  return new;
end;
$$;

drop trigger if exists review_likes_count_trigger on review_likes;
create trigger review_likes_count_trigger
  after insert or delete on review_likes
  for each row execute function review_likes_count_trigger();

-- ---------------------------------------------------------------------------
-- Like-triggered push throttle — same claim-the-window shape as
-- claim_vote_push_window (038_vote_push_throttle.sql). SECURITY DEFINER
-- because the person claiming the window is whoever just liked the review,
-- not the review's own author, and visits_update (007_rls.sql) only allows
-- the review's author to write to their own visits row.

alter table visits add column if not exists last_like_push_at timestamptz;

create or replace function claim_review_like_push_window(
  p_visit_id uuid,
  p_window_seconds int default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  update visits
  set last_like_push_at = now()
  where id = p_visit_id
    and (
      last_like_push_at is null
      or last_like_push_at < now() - (p_window_seconds || ' seconds')::interval
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

grant execute on function claim_review_like_push_window(uuid, int) to authenticated;
