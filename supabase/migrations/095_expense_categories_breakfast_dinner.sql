-- 095_expense_categories_breakfast_dinner.sql
--
-- Adds "breakfast" and "dinner" to expense_entries.category, alongside the
-- original lunch/coffee/snack/other set from 094_expense_entries.sql.
-- Postgres has no ALTER on a check constraint's own condition — drop and
-- recreate under the same auto-generated name that CREATE TABLE's inline
-- `check (...)` produced (table_column_check).

alter table expense_entries drop constraint expense_entries_category_check;

alter table expense_entries add constraint expense_entries_category_check
  check (category in ('breakfast','lunch','dinner','coffee','snack','other'));
