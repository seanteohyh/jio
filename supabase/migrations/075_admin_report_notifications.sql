-- 075_admin_report_notifications.sql
--
-- Every admin gets a push when a general report (§17 "Report a problem",
-- or a Home "Give feedback" suggestion) is filed — both create a
-- general_reports row, so both trigger from the same send path. A
-- dedicated per-type mute, same "stacks on top of the master notify_events
-- switch" shape reminders_enabled already established, not a repurposing
-- of that switch — this is a moderation notification, not a Jio-lifecycle
-- one, and muting it should never silently mute Jio invites/decided pushes
-- too.

alter table profiles add column if not exists notify_admin_reports boolean not null default true;

-- Same reasoning as get_push_targets (037) / list_admin_ids (042): both
-- admins and profiles are owner-scoped by RLS, so resolving "which admins
-- currently want this" needs its own SECURITY DEFINER read rather than a
-- plain cross-user query. sendPushToUsers's own get_push_targets call
-- still applies notify_events + live-subscription filtering on top of
-- whatever this returns — this only narrows by the admin-specific mute.
create or replace function list_admin_report_recipients()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select a.user_id
  from admins a
  join profiles p on p.user_id = a.user_id
  where p.notify_admin_reports = true;
$$;

grant execute on function list_admin_report_recipients() to authenticated;
