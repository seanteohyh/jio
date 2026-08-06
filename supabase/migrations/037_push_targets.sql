-- 037_push_targets.sql
--
-- CHANGES_20260804.md §6 — the send path for push notifications needs to
-- read the *target* user's subscriptions, not the caller's own. Both
-- push_subscriptions_select and profiles' own policies are owner-scoped
-- (`user_id = auth.uid()`), same as the rest of this schema's default —
-- so the app hitting "notify the host" or "notify everyone invited" as a
-- side effect of a normal action (inviting someone, closing a Jio) would
-- have every one of those reads refused by RLS, same wall every other
-- cross-user read in this app runs into.
--
-- SECURITY DEFINER, not a broadened SELECT policy on push_subscriptions
-- itself: a push endpoint + keys are more sensitive than a display name,
-- so this stays a narrow, purpose-built read (exactly the columns the send
-- path needs, already filtered to notify_events = true) rather than
-- opening the raw table to every authenticated user the way
-- kakis_select/event_invitees_select already do for lower-stakes data.
--
-- No admin check, unlike get_admin_analytics — any signed-in user
-- legitimately triggers these sends just by using the app normally (invite
-- someone, close a Jio), the same "any authenticated teammate" trust
-- boundary the rest of this single-office app already runs on.
create or replace function get_push_targets(p_user_ids uuid[])
returns table (
  user_id uuid,
  endpoint text,
  p256dh text,
  auth_key text
)
language sql
security definer
set search_path = public
as $$
  select s.user_id, s.endpoint, s.p256dh, s.auth_key
  from push_subscriptions s
  join profiles p on p.user_id = s.user_id
  where s.user_id = any(p_user_ids)
    and p.notify_events = true;
$$;

grant execute on function get_push_targets(uuid[]) to authenticated;
