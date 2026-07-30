-- 015_anonymous_profiles.sql
-- Makes profile seeding work for name-only (anonymous) sign-in.
--
-- The trigger from migration 011 derived a display name from the email local
-- part. An anonymous user has no email, so every one of them would land as
-- "friend". This version reads the display name the client passed in at
-- sign-up, and only falls back to the email when there is one.
--
-- Run this if you are using NEXT_PUBLIC_JIO_AUTH_ADAPTER=name. It is harmless
-- on an email-only deployment: the email branch behaves exactly as before.
--
-- One dashboard step has no SQL equivalent: turn on
-- Authentication → Providers → Anonymous sign-ins. Without it, name sign-in
-- fails with "Anonymous sign-ins are disabled".

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_name text;
begin
  -- 1. What the user typed on the login screen, if anything.
  chosen_name := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');

  -- 2. Otherwise the local part of their email.
  if chosen_name is null and new.email is not null then
    chosen_name := split_part(new.email, '@', 1);
  end if;

  -- 3. Otherwise something stable and unique enough to tell people apart.
  if chosen_name is null then
    chosen_name := 'Teammate ' || substr(new.id::text, 1, 6);
  end if;

  insert into public.profiles (user_id, display_name)
  values (new.id, chosen_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Repair any rows the older trigger already mislabelled.
update public.profiles p
set display_name = 'Teammate ' || substr(p.user_id::text, 1, 6)
where p.display_name = 'friend';
