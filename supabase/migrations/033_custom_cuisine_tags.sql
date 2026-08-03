-- 033_custom_cuisine_tags.sql
--
-- CHANGES_20260803.md §12d: add Modern and Traditional as real, scored
-- cuisine categories, and turn the old "Other" chip into a place for a
-- free-text tag instead of a dead-end fixed value.
--
-- Decided 3 Aug: a tag typed through "Other" is display-only — it shows on
-- the place like any other cuisine pill, but never touches
-- recommendConfig.ts. The named categories (including the new Modern and
-- Traditional) keep affecting scoring exactly as before. Keeping custom tags
-- in their own column, rather than mixed into `cuisine`, is what makes that
-- exclusion automatic: `recommend.ts`'s cuisineAffinityScore only ever reads
-- `places.cuisine`, so it never has to know this column exists.
--
-- (`modern` / `traditional` themselves need no schema change — `cuisine` is
-- untyped `text[]`, so the new values are just added to the app-level
-- CUISINES list in src/lib/constants.ts.)

alter table places add column if not exists custom_cuisine_tags text[] default '{}';

-- ------------------------------------------------------- re-derive grants --
-- 027_place_editing.sql's comment claims "adding a new user-editable column
-- to `places` now needs no migration here at all," because its grant is
-- derived from information_schema rather than hand-listed. That's only true
-- of the *policy* (`using (true) with check (true)`, unconditional). The
-- column-level GRANT itself is a snapshot taken when 027 ran — a column
-- added afterward, like custom_cuisine_tags above, is invisible to a
-- Postgres role's privileges until the GRANT is re-issued. Skipping this
-- step would reproduce §1's original "permission denied for table places"
-- bug for exactly this column. So: re-run 027's derivation verbatim.

do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into v_cols
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'places'
      and column_name not in (
        'id', 'created_by', 'created_at', 'status',
        'avg_rating', 'visit_count', 'rating_updated_at', 'has_pending_flag',
        'osm_id', 'source'
      );

  execute 'revoke update on places from authenticated';
  execute format('grant update (%s) on places to authenticated', v_cols);
end $$;
