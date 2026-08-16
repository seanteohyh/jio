-- 050_fix_lobang_rls_recursion.sql
--
-- Bug, reported 16 Aug with a screenshot: sending a lobang fails with
-- "Could not send that lobang: infinite recursion detected in policy for
-- relation 'lobangs'."
--
-- Root cause: 019_lobang_group_send.sql gave `lobangs_select` a subquery
-- into `lobang_recipients`, and gave `lobang_recipients_select` /
-- `_insert` / `_delete` each a subquery back into `lobangs`. Evaluating
-- either table's RLS-protected subquery requires evaluating the other
-- table's policy, which requires the first table's policy again —
-- Postgres's query rewriter has to expand this into the plan before
-- execution even starts, so it hits a genuine, unbounded A→B→A cycle and
-- refuses to proceed (SQLSTATE 42P17), deterministically, on every
-- `sendLobang()` call (`supabaseRepo.ts`) that inserts into
-- `lobang_recipients` right after inserting into `lobangs`, not as an
-- intermittent or data-dependent failure.
--
-- Fix: the same SECURITY DEFINER escape hatch already used throughout
-- this schema (`get_push_targets`, `list_admin_ids`, `add_kaki_member`,
-- `get_public_place`, …) for exactly this "one table's policy legitimately
-- needs to read another's" situation. A SECURITY DEFINER function's own
-- internal query runs as the function's owner, bypassing RLS entirely for
-- that one lookup — so checking "is this lobang mine to send/see" no
-- longer re-triggers the other table's policy, which is what breaks the
-- cycle.

create or replace function is_lobang_sender(p_lobang_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from lobangs
    where id = p_lobang_id and from_user_id = auth.uid()
  );
$$;

create or replace function is_lobang_recipient(p_lobang_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from lobang_recipients
    where lobang_id = p_lobang_id and user_id = auth.uid()
  );
$$;

grant execute on function is_lobang_sender(uuid) to authenticated;
grant execute on function is_lobang_recipient(uuid) to authenticated;

drop policy if exists "lobang_recipients_select" on lobang_recipients;
create policy "lobang_recipients_select" on lobang_recipients
  for select to authenticated
  using (user_id = auth.uid() or is_lobang_sender(lobang_id));

drop policy if exists "lobang_recipients_insert" on lobang_recipients;
create policy "lobang_recipients_insert" on lobang_recipients
  for insert to authenticated
  with check (is_lobang_sender(lobang_id));

drop policy if exists "lobang_recipients_delete" on lobang_recipients;
create policy "lobang_recipients_delete" on lobang_recipients
  for delete to authenticated
  using (user_id = auth.uid() or is_lobang_sender(lobang_id));

drop policy if exists "lobangs_select" on lobangs;
create policy "lobangs_select" on lobangs
  for select to authenticated
  using (from_user_id = auth.uid() or is_lobang_recipient(id));

-- ----------------------------------------------------------------- sanity check ---
-- Read after running. Both functions must appear.

select proname from pg_proc
where proname in ('is_lobang_sender', 'is_lobang_recipient');
