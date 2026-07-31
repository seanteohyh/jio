-- 025_push_notifications.sql
--
-- Scaffolding only — schema, subscription storage, and the send-trigger
-- wiring are all real, but actually delivering a push requires VAPID keys
-- (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT), which is left as a
-- deferred infrastructure step for whoever deploys this, the same pattern
-- SETUP.md already uses for SMTP. Without those env vars, sendPush() in
-- src/lib/push.ts logs and no-ops rather than failing.
-- See CHANGELOG_20260729.md, "Push notifications & Lobangs".

create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  -- The endpoint URL is itself unique per browser/device registration —
  -- that's what "one subscription per device" means in the Push API.
  endpoint   text not null unique,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select" on push_subscriptions;
create policy "push_subscriptions_select" on push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "push_subscriptions_insert" on push_subscriptions;
create policy "push_subscriptions_insert" on push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_delete" on push_subscriptions;
create policy "push_subscriptions_delete" on push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- Two independent toggles, not four — "Jio invites" covers every event-
-- lifecycle moment (invite created, event closing, winner announced) under
-- one preference; "Lobangs" is separate. Both default on.
alter table profiles add column if not exists notify_events boolean not null default true;
alter table profiles add column if not exists notify_lobangs boolean not null default true;
