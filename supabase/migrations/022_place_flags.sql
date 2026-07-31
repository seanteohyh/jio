-- 022_place_flags.sql
--
-- Flag Inaccurate Places. Reconciled onto the admin/moderation system
-- already shipped in 017_admin_and_moderation.sql rather than introducing a
-- second, parallel admin concept (the original design called for a new
-- `profiles.is_admin` column — dropped in favour of the existing `admins`
-- allowlist table, which is the one real access-control mechanism this app
-- has). "Resolution: archived" from the original design is likewise folded
-- into the existing `status = 'blocked'` vocabulary rather than adding a new
-- status value that would need identical exclusion logic everywhere
-- `blocked` already has. See CHANGELOG_20260729.md, "Flag Inaccurate
-- Places (admin review)".

create table if not exists place_flags (
  id          uuid primary key default gen_random_uuid(),
  place_id    uuid not null references places(id) on delete cascade,
  flagged_by  uuid not null,
  reason      text not null check (
    reason in ('closed', 'wrong_info', 'duplicate', 'inappropriate', 'other')
  ),
  comment     text,
  status      text not null default 'pending' check (status in ('pending', 'resolved')),
  -- 'blocked' here means "an admin acted on this by blocking the place",
  -- reusing block_place's own vocabulary rather than a synonym.
  resolution  text check (resolution in ('dismissed', 'edited', 'blocked')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at  timestamptz default now()
);

create index if not exists place_flags_place_idx on place_flags (place_id);
create index if not exists place_flags_status_idx on place_flags (status);
create index if not exists place_flags_flagged_by_idx on place_flags (flagged_by);

alter table places add column if not exists has_pending_flag boolean not null default false;

alter table place_flags enable row level security;

-- A flagger sees their own reports ("My Reports"); an admin sees every flag,
-- which is what the resolution queue needs.
drop policy if exists "place_flags_select" on place_flags;
create policy "place_flags_select" on place_flags
  for select to authenticated
  using (
    flagged_by = auth.uid()
    or exists (select 1 from admins where user_id = auth.uid())
  );

-- Anyone signed in can flag a place — this is a low-stakes report, not a
-- moderation action. It always lands as a fresh pending flag; a client
-- can't insert one pre-resolved.
drop policy if exists "place_flags_insert" on place_flags;
create policy "place_flags_insert" on place_flags
  for insert to authenticated
  with check (flagged_by = auth.uid() and status = 'pending' and resolution is null);

-- No update/delete policy for `authenticated` — resolving a flag only ever
-- happens through resolve_place_flags() below, which runs as the table
-- owner and does every pending flag for a place atomically.

-- --------------------------------------------------------------- trigger --
-- Same pattern as 021_place_ratings_trigger.sql: a place's "has a report
-- pending" badge is a stored, always-current column rather than a join
-- computed on every places read.
create or replace function recompute_place_flag_state(p_place_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update places
  set has_pending_flag = exists(
    select 1 from place_flags
    where place_id = p_place_id and status = 'pending'
  )
  where id = p_place_id;
end;
$$;

create or replace function place_flags_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform recompute_place_flag_state(old.place_id);
    return old;
  end if;

  perform recompute_place_flag_state(new.place_id);
  return new;
end;
$$;

drop trigger if exists place_flags_trigger on place_flags;
create trigger place_flags_trigger
  after insert or update or delete on place_flags
  for each row execute function place_flags_trigger();

-- ---------------------------------------------------------------- resolve --
-- Admin only. Resolves every pending flag on a place in one action, not one
-- at a time — the point of allowing repeat reports without a unique
-- constraint. `p_reason` is only used (and required) when p_resolution is
-- 'blocked', where it becomes the block reason on the usual
-- place_moderation_log trail.
create or replace function resolve_place_flags(
  p_place_id uuid,
  p_resolution text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_resolved_count int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from admins where user_id = v_uid) then
    raise exception 'Only an admin can resolve a flag';
  end if;

  if p_resolution not in ('dismissed', 'edited', 'blocked') then
    raise exception 'Invalid resolution';
  end if;

  if p_resolution = 'blocked' and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'A reason is required to block a place';
  end if;

  update place_flags
  set status = 'resolved',
      resolution = p_resolution,
      resolved_by = v_uid,
      resolved_at = now()
  where place_id = p_place_id and status = 'pending';

  get diagnostics v_resolved_count = row_count;
  if v_resolved_count = 0 then
    raise exception 'At least one pending flag is required to resolve';
  end if;

  if p_resolution = 'blocked' then
    update places set status = 'blocked', updated_at = now() where id = p_place_id;
    insert into place_moderation_log (place_id, actor_id, action, reason)
    values (p_place_id, v_uid, 'block', trim(p_reason));
  end if;
end;
$$;

grant execute on function resolve_place_flags(uuid, text, text) to authenticated;
