-- 084_lobang_reactions.sql
--
-- Reacting to a lobang once you've received it: heart it, reply with a
-- freeform note, or (client-only, no schema needed) start a Jio from it.
-- Both fields are per-recipient, so they live on lobang_recipients rather
-- than lobangs itself — a group send can have each recipient heart/reply
-- independently, exactly like seen_at already does.
alter table lobang_recipients
  add column if not exists liked_at timestamptz,
  add column if not exists reply text,
  add column if not exists reply_created_at timestamptz;

-- No RLS changes needed: lobang_recipients_update (019_lobang_group_send.sql)
-- already lets a recipient update any column on their own row, and
-- lobang_recipients_select already lets both that recipient and the
-- original sender read it — the same policies the pre-existing seen_at
-- column relies on.
