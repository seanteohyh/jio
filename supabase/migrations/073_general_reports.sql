-- 073_general_reports.sql
--
-- UX review log #17 — "Report a problem," a Profile entry point for a
-- problem that isn't about any one place, reusing the low-stakes "anyone
-- can report, an admin resolves it later" shape `place_flags`
-- (022_place_flags.sql) already established, rather than inventing a new
-- interaction pattern.
--
-- A separate table, not a widened `place_flags`: that table is
-- structurally place-shaped end to end — `place_id` is a required FK, and
-- `resolve_place_flags()` batch-resolves every pending flag *for a place*
-- in one action, which has no equivalent grouping for a report that isn't
-- about any specific place. `general_reports` mirrors its shape (pending/
-- resolved, anyone can insert, admin-only resolve) but resolves one row at
-- a time — there's no "same place" to batch by here.

create table if not exists general_reports (
  id          uuid primary key default gen_random_uuid(),
  reported_by uuid not null,
  category    text not null check (
    category in ('not_working', 'place_wrong', 'other')
  ),
  comment     text,
  status      text not null default 'pending' check (status in ('pending', 'resolved')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at  timestamptz default now()
);

create index if not exists general_reports_status_idx on general_reports (status);
create index if not exists general_reports_reported_by_idx on general_reports (reported_by);

alter table general_reports enable row level security;

-- Same visibility shape as place_flags_select: the reporter sees their own
-- ("My Reports," if that ever gets a UI here), an admin sees every report.
drop policy if exists "general_reports_select" on general_reports;
create policy "general_reports_select" on general_reports
  for select to authenticated
  using (
    reported_by = auth.uid()
    or exists (select 1 from admins where user_id = auth.uid())
  );

-- Anyone signed in can file one — always lands pending, never pre-resolved.
drop policy if exists "general_reports_insert" on general_reports;
create policy "general_reports_insert" on general_reports
  for insert to authenticated
  with check (
    reported_by = auth.uid() and status = 'pending' and resolved_by is null
  );

-- No update/delete policy for `authenticated` — resolving only ever
-- happens through resolve_general_report() below, same reasoning
-- resolve_place_flags() already established.

-- Admin only, one report at a time (no place to group by).
create or replace function resolve_general_report(p_report_id uuid)
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

  if not exists (select 1 from admins where user_id = v_uid) then
    raise exception 'Only an admin can resolve a report';
  end if;

  update general_reports
  set status = 'resolved', resolved_by = v_uid, resolved_at = now()
  where id = p_report_id and status = 'pending';
end;
$$;

grant execute on function resolve_general_report(uuid) to authenticated;
