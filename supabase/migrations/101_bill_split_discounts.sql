-- 101_bill_split_discounts.sql
--
-- Discounts for bill-splitting (099_bill_splits.sql). Two independent
-- mechanisms, both optional and combinable:
--
-- - A whole-bill percentage off the subtotal (`bill_splits.discount_percent`)
--   — a membership/promo discount applied to the whole bill, e.g. a
--   loyalty 10% off. Stored as the rate itself (not a frozen cents
--   amount) so it keeps recomputing live as items change, the same
--   reason the subtotal it applies to is tracked live rather than
--   snapshotted once.
-- - A per-item discount (`bill_items.discount_amount_cents` /
--   `discount_percent` — whichever one the host used, the other stays
--   0 — plus `discount_scope`): "a specific line item is cheaper."
--   `discount_scope = 'item'` means only the people actually assigned
--   to that item benefit, same as the item's price was simply lower.
--   `discount_scope = 'shared'` means the discount amount is instead
--   pooled and split across EVERYONE in the roster, weighted by their
--   own order amount — the same proportional mechanism GST/service
--   charge already use to split across the table, reused here rather
--   than inventing a second allocation scheme.
--
-- Both always apply before GST/service charge: the taxable subtotal is
-- whatever's left after discounts, matching how a restaurant POS
-- discount usually works (tax is charged on what was actually paid).
-- The actual math lives in each repo's own `hydrateSplit` (demoRepo.ts,
-- supabaseRepo.ts) and SplitEditor's live preview, not in SQL — the
-- same "repo computes the tally" precedent gst_cents/service_charge_cents
-- already follow.

alter table bill_splits
  add column discount_percent numeric(5, 2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100);

alter table bill_items
  add column discount_amount_cents integer not null default 0
    check (discount_amount_cents >= 0),
  add column discount_percent numeric(5, 2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  add column discount_scope text not null default 'item'
    check (discount_scope in ('item', 'shared'));

-- No RLS changes — these are new columns on tables that already have row
-- level security enabled; policies are row-scoped, not column-scoped, so
-- the existing bill_splits/bill_items policies already cover them.
