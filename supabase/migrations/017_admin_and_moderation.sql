-- 017_admin_and_moderation.sql
-- Admins, and place moderation (block/unblock in place of a real delete).
--
-- "Remove" a place means flipping its status to 'blocked', not deleting the
-- row — blocked already means "invisible everywhere" (see isExcluded() in
-- lib/recommend.ts and the default status filter in listPlaces), and a real
-- DELETE would risk foreign-key trouble the moment a place has any visits,
-- recos, event options or lobangs pointing at it. Blocking keeps the row,
-- its created_by audit trail, and is reversible.

-- ------------------------------------------------------------------ admins --
-- No self-service path to this table anywhere in the app. Rows are added by
-- hand via the Supabase dashboard (or SQL editor), deliberately — the app
-- itself never grants admin.
create table if not exists admins (
  user_id    uuid primary key,
  granted_by uuid,
  granted_at timestamptz default now()
);

alter table admins enable row level security;

-- A user may only ever see whether *they themselves* are in this table —
-- enough for "is_admin" checks, not enough to browse the admin list.
drop policy if exists "admins_select_self" on admins;
create policy "admins_select_self" on admins
  for select to authenticated using (user_id = auth.uid());

-- No insert/update/delete policy for `authenticated` — deliberately. Only a
-- service-role connection (the Supabase dashboard, SQL editor) can write here.

-- --------------------------------------------------------- moderation log --
-- Every block/unblock, who did it, when, and why. Survives a place being
-- blocked and unblocked more than once, unlike a single column on `places`.
create table if not exists place_moderation_log (
  id         uuid primary key default gen_random_uuid(),
  place_id   uuid not null references places(id) on delete cascade,
  actor_id   uuid not null,
  action     text not null check (action in ('block', 'unblock')),
  reason     text,
  created_at timestamptz default now()
);

create index if not exists place_moderation_log_place_idx
  on place_moderation_log (place_id);
create index if not exists place_moderation_log_created_idx
  on place_moderation_log (created_at desc);

alter table place_moderation_log enable row level security;

-- Only admins read the log. Nobody gets an insert/update/delete policy —
-- rows are only ever written by the SECURITY DEFINER functions below, which
-- run as the table owner and bypass RLS entirely.
drop policy if exists "place_moderation_log_select" on place_moderation_log;
create policy "place_moderation_log_select" on place_moderation_log
  for select to authenticated
  using (exists (select 1 from admins where user_id = auth.uid()));

-- ------------------------------------------------------ block / unblock --
-- These are the only sanctioned way `status` moves to/from 'blocked' — see
-- the column-level grant below, which shuts that door for a plain UPDATE.
--
-- block_place: the place's own creator, or any admin. Reason is required.
create or replace function block_place(p_place_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_created_by uuid;
  v_is_admin boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required to block a place';
  end if;

  select created_by into v_created_by from places where id = p_place_id;
  if not found then
    raise exception 'That place does not exist';
  end if;

  select exists(select 1 from admins where user_id = v_uid) into v_is_admin;

  if v_created_by is distinct from v_uid and not v_is_admin then
    raise exception 'Only the place''s creator or an admin can block it';
  end if;

  update places set status = 'blocked', updated_at = now() where id = p_place_id;

  insert into place_moderation_log (place_id, actor_id, action, reason)
  values (p_place_id, v_uid, 'block', trim(p_reason));
end;
$$;

-- unblock_place: admin only.
create or replace function unblock_place(p_place_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select exists(select 1 from admins where user_id = v_uid) into v_is_admin;
  if not v_is_admin then
    raise exception 'Only an admin can unblock a place';
  end if;

  update places
    set status = 'active', updated_at = now()
    where id = p_place_id and status = 'blocked';

  if not found then
    raise exception 'That place is not currently blocked';
  end if;

  insert into place_moderation_log (place_id, actor_id, action, reason)
  values (p_place_id, v_uid, 'unblock', null);
end;
$$;

-- review_place: any signed-in user, confirming or dismissing a place that
-- discovery (OSM/Overpass) just added. Deliberately lighter than block/
-- unblock above — this is crowd-confirmation of data quality ("is this a
-- real place people would eat at?"), not moderation of an established place
-- someone's actually been relying on, so there's no admin/creator gate and
-- no reason required. It only ever moves a place *out of* needs_review, and
-- never touches a place that's already active or blocked.
--
-- A mistaken "no, hide it" isn't a dead end: it leaves the place `blocked`,
-- so an admin can still recover it later through the ordinary unblock_place
-- path above.
create or replace function review_place(p_place_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update places
    set status = case when p_approve then 'active' else 'blocked' end,
        updated_at = now()
    where id = p_place_id and status = 'needs_review';

  if not found then
    raise exception 'That place is not waiting for review';
  end if;
end;
$$;

grant execute on function block_place(uuid, text) to authenticated;
grant execute on function unblock_place(uuid) to authenticated;
grant execute on function review_place(uuid, boolean) to authenticated;

-- Shut the direct path: a plain UPDATE from the app's anon/authenticated
-- role can no longer touch `status` at all, only the functions above can
-- (they run as the table owner, which still has full column access).
-- Every other field stays open, matching the existing "anyone can correct a
-- place" philosophy in the places_update policy.
revoke update on places from authenticated;
grant update (
  name, address, lat, lng, cuisine, budget_tier, best_dishes, notes
) on places to authenticated;

-- --------------------------------------------------- offices, admin-only --
-- Adding a new office/location spends real external API calls (Overpass
-- discovery, OneMap routing) on everyone's behalf going forward, so it gets
-- the same gate as place moderation rather than staying open to any user.
drop policy if exists "offices_insert" on offices;
create policy "offices_insert" on offices
  for insert to authenticated
  with check (exists (select 1 from admins where user_id = auth.uid()));
