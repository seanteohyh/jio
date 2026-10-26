-- 099_bill_splits.sql
--
-- Bill-splitting. A split is its own first-class object, usable on its
-- own (take a photo of any receipt, assign items, see who owes who) —
-- it does NOT require a Jio. It can optionally be linked to one
-- (`event_id`) purely as a convenience: linking pre-fills who's in it
-- from that Jio's own participants, nothing more. Items can be assigned
-- to a registered Jio user OR a name-only "guest" who never signed up
-- for anything — a guest can be WhatsApp-nudged and marked paid, just
-- never push-notified (no account to push to).
--
-- SELECT policies below mostly follow 007_rls.sql's own stated
-- precedent for this app: "several tables let any authenticated user
-- read any row... recursive membership checks in policies... are a much
-- easier thing to get subtly wrong." A split LINKED to a Jio keeps that
-- broad-read shape, same reasoning event_votes/event_options/event_rsvps
-- already use (a Jio's id is only ever reachable by someone already
-- invited to it). A STANDALONE split has its own URL that isn't gated by
-- reaching some other page first, so its read access is narrowed to the
-- creator or an actual participant — still a plain identity check, not a
-- recursive one. Every write (insert/update/delete) is gated the same
-- way creating/closing/rescheduling a Jio already are: a plain
-- `exists (...)` / `created_by = auth.uid()` check, no new SECURITY
-- DEFINER function, matching `rescheduleEvent`/`editEventWinner`'s own
-- host-gated writes.

create table bill_splits (
  id uuid primary key default gen_random_uuid(),
  -- Optional. NULL = a standalone split with no Jio attached. Set only
  -- at creation time (see app code — there's no "attach a Jio later").
  -- `set null` on delete: deleting the Jio later must not destroy a
  -- split that now stands on its own.
  event_id uuid references lunch_events(id) on delete set null,
  created_by uuid not null references auth.users(id),
  -- What the split is for — defaults to the Jio's title when linked,
  -- host-entered otherwise (e.g. "Dinner at Kok Sen").
  title text not null,
  -- Who gets paid back — defaults to the creator, but editable: whoever
  -- actually paid the bill isn't always the person who started the
  -- split. Always a registered user — a guest can owe money in this
  -- model, but never receive it back.
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
create index bill_splits_created_by_idx on bill_splits (created_by);

create table bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_split_id uuid not null references bill_splits(id) on delete cascade,
  label text not null,
  amount_cents integer not null check (amount_cents >= 0),
  position integer not null default 0
);

create index bill_items_split_idx on bill_items (bill_split_id);

-- One row per person actually in the split (anyone with >=1 assigned
-- item, plus the payer) — a stable place for a phone number and paid
-- status to live independent of which items end up assigned to them,
-- and the thing assignment below actually points at (so a guest, who
-- has no auth.users row, can be assigned items exactly like a
-- registered person can).
create table bill_split_participants (
  id uuid primary key default gen_random_uuid(),
  bill_split_id uuid not null references bill_splits(id) on delete cascade,
  -- Exactly one of these two is set — a registered person, or a guest
  -- who was never a Jio user at all.
  user_id uuid references auth.users(id),
  guest_name text,
  -- Ad hoc per split, not a profile field — just enough to build a
  -- wa.me link. Deliberately not reused across splits; see the
  -- feature's own "out of scope" note.
  phone_number text,
  paid_at timestamptz,
  constraint bill_split_participants_identity check (
    (user_id is not null) <> (guest_name is not null)
  )
);

create index bill_split_participants_split_idx on bill_split_participants (bill_split_id);
-- Stops a registered person getting two rows in the same split.
create unique index bill_split_participants_user_uniq
  on bill_split_participants (bill_split_id, user_id)
  where user_id is not null;

-- Many-to-many: an item shared by 2 people gets 2 rows, and its cost
-- splits evenly across however many assignee rows exist for it.
create table bill_item_assignees (
  item_id uuid not null references bill_items(id) on delete cascade,
  participant_id uuid not null references bill_split_participants(id) on delete cascade,
  primary key (item_id, participant_id)
);

alter table bill_splits enable row level security;
alter table bill_items enable row level security;
alter table bill_item_assignees enable row level security;
alter table bill_split_participants enable row level security;

create policy "bill_splits_select" on bill_splits
  for select to authenticated using (
    event_id is not null
    or created_by = auth.uid()
    or exists (
      select 1 from bill_split_participants p
      where p.bill_split_id = bill_splits.id and p.user_id = auth.uid()
    )
  );
create policy "bill_splits_insert" on bill_splits
  for insert to authenticated with check (
    created_by = auth.uid()
    and (
      event_id is null
      or exists (
        select 1 from lunch_events e
        where e.id = event_id and e.host_id = auth.uid()
      )
    )
  );
create policy "bill_splits_update" on bill_splits
  for update to authenticated
  using (
    (event_id is null and created_by = auth.uid())
    or (event_id is not null and exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    ))
  )
  with check (
    (event_id is null and created_by = auth.uid())
    or (event_id is not null and exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    ))
  );
create policy "bill_splits_delete" on bill_splits
  for delete to authenticated using (
    (event_id is null and created_by = auth.uid())
    or (event_id is not null and exists (
      select 1 from lunch_events e
      where e.id = event_id and e.host_id = auth.uid()
    ))
  );

create policy "bill_items_select" on bill_items
  for select to authenticated using (
    exists (
      select 1 from bill_splits s
      where s.id = bill_items.bill_split_id
        and (
          s.event_id is not null
          or s.created_by = auth.uid()
          or exists (
            select 1 from bill_split_participants p
            where p.bill_split_id = s.id and p.user_id = auth.uid()
          )
        )
    )
  );
create policy "bill_items_write" on bill_items
  for all to authenticated
  using (
    exists (
      select 1 from bill_splits s
      where s.id = bill_items.bill_split_id
        and (
          (s.event_id is null and s.created_by = auth.uid())
          or (s.event_id is not null and exists (
            select 1 from lunch_events e
            where e.id = s.event_id and e.host_id = auth.uid()
          ))
        )
    )
  )
  with check (
    exists (
      select 1 from bill_splits s
      where s.id = bill_items.bill_split_id
        and (
          (s.event_id is null and s.created_by = auth.uid())
          or (s.event_id is not null and exists (
            select 1 from lunch_events e
            where e.id = s.event_id and e.host_id = auth.uid()
          ))
        )
    )
  );

create policy "bill_split_participants_select" on bill_split_participants
  for select to authenticated using (
    exists (
      select 1 from bill_splits s
      where s.id = bill_split_participants.bill_split_id
        and (
          s.event_id is not null
          or s.created_by = auth.uid()
          or exists (
            select 1 from bill_split_participants p2
            where p2.bill_split_id = s.id and p2.user_id = auth.uid()
          )
        )
    )
  );
create policy "bill_split_participants_write" on bill_split_participants
  for all to authenticated
  using (
    exists (
      select 1 from bill_splits s
      where s.id = bill_split_participants.bill_split_id
        and (
          (s.event_id is null and s.created_by = auth.uid())
          or (s.event_id is not null and exists (
            select 1 from lunch_events e
            where e.id = s.event_id and e.host_id = auth.uid()
          ))
        )
    )
  )
  with check (
    exists (
      select 1 from bill_splits s
      where s.id = bill_split_participants.bill_split_id
        and (
          (s.event_id is null and s.created_by = auth.uid())
          or (s.event_id is not null and exists (
            select 1 from lunch_events e
            where e.id = s.event_id and e.host_id = auth.uid()
          ))
        )
    )
  );

create policy "bill_item_assignees_select" on bill_item_assignees
  for select to authenticated using (
    exists (
      select 1 from bill_items i
      join bill_splits s on s.id = i.bill_split_id
      where i.id = bill_item_assignees.item_id
        and (
          s.event_id is not null
          or s.created_by = auth.uid()
          or exists (
            select 1 from bill_split_participants p
            where p.bill_split_id = s.id and p.user_id = auth.uid()
          )
        )
    )
  );
create policy "bill_item_assignees_write" on bill_item_assignees
  for all to authenticated
  using (
    exists (
      select 1 from bill_items i
      join bill_splits s on s.id = i.bill_split_id
      where i.id = bill_item_assignees.item_id
        and (
          (s.event_id is null and s.created_by = auth.uid())
          or (s.event_id is not null and exists (
            select 1 from lunch_events e
            where e.id = s.event_id and e.host_id = auth.uid()
          ))
        )
    )
  )
  with check (
    exists (
      select 1 from bill_items i
      join bill_splits s on s.id = i.bill_split_id
      where i.id = bill_item_assignees.item_id
        and (
          (s.event_id is null and s.created_by = auth.uid())
          or (s.event_id is not null and exists (
            select 1 from lunch_events e
            where e.id = s.event_id and e.host_id = auth.uid()
          ))
        )
    )
  );

-- ------------------------------------------------------------- storage --
-- This app's first Storage usage — private bucket, no existing pattern
-- to extend. Upload always happens server-side (the API route uploads
-- as the signed-in user; app code is the real gate), so insert just
-- needs to allow any authenticated write into this one bucket. Select
-- stays broad for the same reason the table policies above do —
-- `createSignedUrl` still needs select permission on the object to issue
-- one, and a signed, time-limited URL is what the app actually hands to
-- the browser, not this policy directly. Object paths are now
-- `<uploader_id>/<uuid>.jpg` (scanning happens before any split row
-- exists, so there's no bill_split_id or event_id to key off yet).
--
-- This section is unchanged from the original 099 and is safe to
-- re-run even if it already applied once — `on conflict do nothing` for
-- the bucket, `drop policy if exists` before each `create policy` for
-- the three below — since Supabase blocks a raw `delete` against
-- `storage.objects`/`storage.buckets` (a `protect_delete()` trigger;
-- use the Storage API/dashboard if the bucket itself ever needs
-- recreating, never SQL).
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts_select" on storage.objects;
create policy "receipts_select" on storage.objects
  for select to authenticated using (bucket_id = 'receipts');
drop policy if exists "receipts_insert" on storage.objects;
create policy "receipts_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'receipts');
drop policy if exists "receipts_delete" on storage.objects;
create policy "receipts_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'receipts');
