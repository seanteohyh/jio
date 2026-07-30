-- 011_profiles.sql
-- Display names, so the UI can say "Mei Lin" instead of a UUID prefix.
--
-- Deliberately minimal: this table exists to turn an id into a label, not to
-- become a general user store. auth.users already holds the account.

create table if not exists profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz default now()
);

alter table profiles enable row level security;

-- Everyone can read names — otherwise votes and RSVPs are anonymous UUIDs.
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles
  for select to authenticated using (true);

drop policy if exists "profiles_insert" on profiles;
create policy "profiles_insert" on profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Seed a profile on signup from the email local part, so a new user is never
-- nameless. They can change it on /profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, split_part(coalesce(new.email, 'friend'), '@', 1))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
