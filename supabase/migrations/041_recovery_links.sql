-- 041_recovery_links.sql
--
-- Personal recovery links — the collision-safe counterpart to §4's
-- name-based claim (migration 040 / nameAuth.ts). Discussed after §4 landed:
-- name-based claim is only safe while names happen to be unique across the
-- team. The moment two different real people share a name, auto-merging on
-- an exact name match stops being a convenience and starts being a way for
-- the second "Sean" to silently absorb the first Sean's account. A recovery
-- link has no such risk — it's tied to one specific account via an
-- unguessable token, never to a name — so it's meant to become the primary
-- recovery path once there are enough real users for name collisions to be
-- plausible, with name-based claim staying available (or later disabled)
-- as a separate, independent mechanism. Both share the same underlying
-- `merge_user_accounts` (migration 040); this migration only adds the
-- token side.
--
-- Same "possession of the token is the invite" reasoning as
-- `lunch_events.invite_token` / `kakis.invite_token` — nothing here checks
-- *who* is redeeming a token, only that they have it.

alter table profiles
  add column if not exists recovery_token text unique;

-- profiles_select (007_rls.sql) is `using (true)` — any authenticated user
-- can already read any row. That's fine for display_name; it would not be
-- fine for recovery_token, which would turn "any signed-in teammate" into
-- "anyone who can list profiles" being able to take over any account. RLS
-- is row-level, not column-level, so the fix is a column-level grant: only
-- the columns that were already meant to be public stay selectable, and
-- recovery_token is reachable only through the SECURITY DEFINER functions
-- below, which run as the table owner and bypass this entirely.
revoke select on profiles from authenticated;
grant select (
  user_id, display_name, created_at, onboarded_at, notify_events, notify_lobangs
) on profiles to authenticated;

-- Self (auth.uid() = p_user_id) or admin. Regenerating overwrites any
-- previous token, which also retires it — there is deliberately no way to
-- list or recover an old one, only mint a fresh one.
create or replace function generate_recovery_token(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_token text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select exists(select 1 from admins where user_id = v_uid) into v_is_admin;
  if v_uid is distinct from p_user_id and not v_is_admin then
    raise exception 'You may only get a recovery link for your own account';
  end if;

  v_token := gen_random_uuid()::text;

  update profiles set recovery_token = v_token where user_id = p_user_id;
  if not found then
    raise exception 'That account does not exist';
  end if;

  return v_token;
end;
$$;

-- No auth check by design — same as resolving an invite_token. The token
-- itself, not the caller's identity, is what authorizes a redemption; the
-- merge it feeds into (mergeUserAccounts) still separately validates the
-- *keep* side is the caller's own current session.
create or replace function resolve_recovery_token(p_token text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select user_id from profiles where recovery_token = p_token;
$$;

grant execute on function generate_recovery_token(uuid) to authenticated;
grant execute on function resolve_recovery_token(text) to authenticated;
