-- 099_bill_splits.sql
--
-- Receipt bill-splitting. A host photographs the receipt from a Jio
-- (scanned via a vision API call, application-side — nothing about OCR
-- lives in this migration), assigns line items to whoever shared them,
-- and the app works out who owes the host (or whoever actually paid) how
-- much, including whether GST/service charge are split in.
--
-- SELECT policies here follow 007_rls.sql's own stated precedent for this
-- app, not a new, stricter one: "several tables let any authenticated
-- user read any row... recursive membership checks in policies... are a
-- much easier thing to get subtly wrong." event_votes/event_options/
-- event_rsvps are all `using (true)` for exactly that reason — a Jio's
-- id is only ever reachable by someone already invited to it. Bill-split
-- data is reached the same way (through an event id you already have),
-- so it gets the same broad-read, narrow-write shape: every mutation
-- here is host-only, matching how creating/closing/rescheduling a Jio
-- already work, via a plain `exists (select 1 from lunch_events e where
-- e.id = ... and e.host_id = auth.uid())` check — no new SECURITY
-- DEFINER function needed, same reasoning `rescheduleEvent`/
-- `editEventWinner` already document for their own host-gated writes.

create table bill_splits (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references lunch_events(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  -- Who gets paid back — defaults to the host at creation, but editable:
  -- whoever actually paid the bill isn't always the person who hosted
  -- the Jio.
  payer_user_id uuid not null references auth.users(id),
  -- Object path in the `receipts` storage bucket below. Nullable — the
  -- manual-entry path (no photo, type items by hand) never sets this.
  receipt_image_path text,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  gst_cents integer not null default 0 check (gst_cents >= 0),
  service_charge_cents integer not null default 0 check (service_charge_cents >= 0),
  gst_included boolean not null default true,
  service_charge_included boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  created_at timestamptz not null default now()
);

create index bill_splits_event_idx on bill_splits (event_id);

create table bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_split_id uuid not null references bill_splits(id) on delete cascade,
  label text not null,
  amount_cents integer not null check (amount_cents >= 0),
  position integer not null default 0
);

create index bill_items_split_idx on bill_items (bill_split_id);

-- Many-to-many: an item shared by 2 people gets 2 rows, and its cost
-- splits evenly across however many assignee rows exist for it.
create table bill_item_assignees (
  item_id uuid not null references bill_items(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  primary key (item_id, user_id)
);

-- One row per person actually in the split (anyone with >=1 assigned
-- item, plus the payer) — a stable place for a phone number and paid
-- status to live independent of which items end up assigned to them.
create table bill_split_participants (
  bill_split_id uuid not null references bill_splits(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  -- Ad hoc per split, not a profile field — just enough to build a
  -- wa.me link. Deliberately not reused across Jios; see the feature's
  -- own "out of scope for v1" note.
  phone_number text,
  paid_at timestamptz,
  primary key (bill_split_id, user_id)
);

alter table bill_splits enable row level security;
alter table bill_items enable row level security;
alter table bill_item_assignees enable row level security;
alter table bill_split_participants enable row level security;

create policy "bill_splits_select" on bill_splits
  for select to authenticated using (true);
create policy "bill_splits_insert" on bill_splits
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );
create policy "bill_splits_update" on bill_splits
  for update to authenticated
  using (
    exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );
create policy "bill_splits_delete" on bill_splits
  for delete to authenticated using (
    exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    )
  );

create policy "bill_items_select" on bill_items
  for select to authenticated using (true);
create policy "bill_items_write" on bill_items
  for all to authenticated
  using (
    exists (
      select 1 from bill_splits s
      join lunch_events e on e.id = s.event_id
      where s.id = bill_split_id and e.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from bill_splits s
      join lunch_events e on e.id = s.event_id
      where s.id = bill_split_id and e.host_id = auth.uid()
    )
  );

create policy "bill_item_assignees_select" on bill_item_assignees
  for select to authenticated using (true);
create policy "bill_item_assignees_write" on bill_item_assignees
  for all to authenticated
  using (
    exists (
      select 1 from bill_items i
      join bill_splits s on s.id = i.bill_split_id
      join lunch_events e on e.id = s.event_id
      where i.id = item_id and e.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from bill_items i
      join bill_splits s on s.id = i.bill_split_id
      join lunch_events e on e.id = s.event_id
      where i.id = item_id and e.host_id = auth.uid()
    )
  );

create policy "bill_split_participants_select" on bill_split_participants
  for select to authenticated using (true);
create policy "bill_split_participants_write" on bill_split_participants
  for all to authenticated
  using (
    exists (
      select 1 from bill_splits s
      join lunch_events e on e.id = s.event_id
      where s.id = bill_split_id and e.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from bill_splits s
      join lunch_events e on e.id = s.event_id
      where s.id = bill_split_id and e.host_id = auth.uid()
    )
  );

-- ------------------------------------------------------------- storage --
-- This app's first Storage usage — private bucket, no existing pattern
-- to extend. Upload always happens server-side (the API route checks
-- host-only before ever writing), so insert just needs to allow any
-- authenticated write into this one bucket; the real gate already ran
-- in application code by the time it gets here, same shape
-- `event_options_insert`'s own comment describes for its policy being
-- the authoritative check with app code only adding a readable error.
-- Select stays broad for the same reason the table policies above do —
-- `createSignedUrl` still needs select permission on the object to issue
-- one, and a signed, time-limited URL is what the app actually hands to
-- the browser, not this policy directly.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts_select" on storage.objects
  for select to authenticated using (bucket_id = 'receipts');
create policy "receipts_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'receipts');
create policy "receipts_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'receipts');
