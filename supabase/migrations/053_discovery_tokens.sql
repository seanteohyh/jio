-- 053_discovery_tokens.sql
--
-- CHANGES_20260818.md §3 / docs/user-discovery.md §4.3 — a personal invite
-- link. Same "unguessable token, SECURITY DEFINER resolver" shape already
-- used throughout this schema (lobangs.public_token / 051,
-- profiles.recovery_token / 041). A distinct column from recovery_token on
-- purpose: recovery_token must stay secret indefinitely (it's a login
-- bypass), discovery_token is *meant* to be handed out (posted, texted, put
-- on a QR code) — different threat models, sharing a column would blur
-- that.

alter table profiles
  add column if not exists discovery_token text unique;

-- Self or admin. Regenerating overwrites any previous token, retiring it —
-- same "no way to list or recover an old one, only mint a fresh one" as
-- generate_recovery_token.
create or replace function generate_discovery_token(p_user_id uuid)
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
    raise exception 'You may only get a personal invite link for your own account';
  end if;

  v_token := gen_random_uuid()::text;

  update profiles set discovery_token = v_token where user_id = p_user_id;
  if not found then
    raise exception 'That account does not exist';
  end if;

  return v_token;
end;
$$;

-- Public — no auth required, same "possession of the token is the invite"
-- reasoning as every other token in this schema. Returns only what
-- /u/[token] needs: the resolved account's id (to drive "Start a Jio
-- with them" / "Add them to a Kaki") and display name — never email,
-- office, or anything else off the row. profiles_select's column grant
-- (007_rls.sql) already excludes discovery_token itself the same way it
-- excludes recovery_token, so this function is the only path to it either
-- way.
create or replace function resolve_discovery_token(p_token text)
returns table (user_id uuid, display_name text)
language sql
security definer
set search_path = public
stable
as $$
  select p.user_id, p.display_name
  from profiles p
  where p.discovery_token = p_token;
$$;

grant execute on function generate_discovery_token(uuid) to authenticated;
grant execute on function resolve_discovery_token(text) to anon, authenticated;

-- ----------------------------------------------------------------- sanity checks ---
-- Read after running. Both must return exactly one row.

select proname from pg_proc where proname = 'generate_discovery_token';
select proname from pg_proc where proname = 'resolve_discovery_token';
