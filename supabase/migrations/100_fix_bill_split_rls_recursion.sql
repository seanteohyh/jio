-- 100_fix_bill_split_rls_recursion.sql
--
-- Bug, reported from production with a screenshot: saving a standalone
-- split fails with "Could not save the bill split: infinite recursion
-- detected in policy for relation 'bill_splits'."
--
-- Root cause: 099_bill_splits.sql gave `bill_splits_select` a subquery
-- into `bill_split_participants` (to let an actual participant read a
-- standalone split they don't own), and gave `bill_split_participants_select`
-- a subquery back into `bill_splits` *plus* a second subquery into
-- `bill_split_participants` itself (checking whether the viewer is a
-- participant of the same split as the row being read). Evaluating any
-- of these RLS-protected subqueries requires evaluating the target
-- table's own policy, which requires evaluating the first subquery
-- again — both the bill_splits <-> bill_split_participants cross-table
-- cycle and the bill_split_participants self-reference are genuine,
-- unbounded A->B->A cycles that Postgres's query rewriter has to expand
-- before execution even starts, so it refuses to proceed (SQLSTATE
-- 42P17) on every read or write that touches a standalone split's
-- participant roster, not as an intermittent or data-dependent failure.
--
-- Fix: the same SECURITY DEFINER escape hatch already used throughout
-- this schema (`get_push_targets`, `list_admin_ids`, `add_kaki_member`,
-- `get_public_place`, `is_lobang_sender`/`is_lobang_recipient` in
-- 050_fix_lobang_rls_recursion.sql — the identical bug class, same fix)
-- for exactly this "one table's policy legitimately needs to read
-- another's" situation. A SECURITY DEFINER function's own internal
-- query runs as the function's owner, bypassing RLS entirely for that
-- one lookup — so checking "is this user a participant of this split"
-- no longer re-triggers bill_split_participants' own policy, which is
-- what breaks both cycles.

create or replace function is_bill_split_participant(p_split_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from bill_split_participants
    where bill_split_id = p_split_id and user_id = auth.uid()
  );
$$;

grant execute on function is_bill_split_participant(uuid) to authenticated;

drop policy if exists "bill_splits_select" on bill_splits;
create policy "bill_splits_select" on bill_splits
  for select to authenticated using (
    event_id is not null
    or created_by = auth.uid()
    or is_bill_split_participant(id)
  );

drop policy if exists "bill_split_participants_select" on bill_split_participants;
create policy "bill_split_participants_select" on bill_split_participants
  for select to authenticated using (
    exists (
      select 1 from bill_splits s
      where s.id = bill_split_participants.bill_split_id
        and (
          s.event_id is not null
          or s.created_by = auth.uid()
          or is_bill_split_participant(s.id)
        )
    )
  );

-- ----------------------------------------------------------------- sanity check ---
-- Read after running. Must appear.

select proname from pg_proc where proname = 'is_bill_split_participant';
