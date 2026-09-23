-- 096_lobang_comments.sql
--
-- Turns a lobang's reply from a single, per-recipient, overwrite-in-place
-- note into a real multi-message comment thread. The old model
-- (084_lobang_reactions.sql) gave each recipient exactly one reply back to
-- the sender, editable but never more than one message, and the sender
-- could never post into it at all — a real user report ("tried to reply a
-- reply") confirmed this read as a bug, not a deliberate one-shot design.
--
-- Decided scope (matches how a lobang already treats a group send as one
-- shared thing, not N private copies): a lobang sent to several people, or
-- a whole Kaki, now gets ONE shared comment thread — every recipient and
-- the original sender can all read and post into it, back and forth, like
-- a comments section under the lobang itself. This is a real widening from
-- "sender privately sees each recipient's own reply" to "everyone involved
-- sees the whole conversation" — deliberate, per the reasoning above, but
-- worth flagging as a genuine behaviour change, not just a bigger textbox.

create table if not exists lobang_comments (
  id         uuid primary key default gen_random_uuid(),
  lobang_id  uuid not null references lobangs(id) on delete cascade,
  user_id    uuid not null,
  text       text not null,
  created_at timestamptz not null default now()
);

create index if not exists lobang_comments_lobang_idx
  on lobang_comments (lobang_id, created_at);

-- Backfill: every existing single reply becomes that thread's first
-- comment, authored by the recipient who wrote it.
insert into lobang_comments (lobang_id, user_id, text, created_at)
select lobang_id, user_id, reply, coalesce(reply_created_at, now())
from lobang_recipients
where reply is not null;

alter table lobang_recipients drop column if exists reply;
alter table lobang_recipients drop column if exists reply_created_at;

alter table lobang_comments enable row level security;

-- Only the sender or one of the recipients may ever read or post into a
-- lobang's thread — same "only the people actually involved" boundary
-- lobangs/lobang_recipients already enforce (016/019_lobang_*.sql), just
-- extended to a shared thread instead of one private row per recipient.
drop policy if exists "lobang_comments_select" on lobang_comments;
create policy "lobang_comments_select" on lobang_comments
  for select to authenticated
  using (
    exists (
      select 1 from lobangs l
      where l.id = lobang_comments.lobang_id and l.from_user_id = auth.uid()
    )
    or exists (
      select 1 from lobang_recipients r
      where r.lobang_id = lobang_comments.lobang_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "lobang_comments_insert" on lobang_comments;
create policy "lobang_comments_insert" on lobang_comments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from lobangs l
        where l.id = lobang_comments.lobang_id and l.from_user_id = auth.uid()
      )
      or exists (
        select 1 from lobang_recipients r
        where r.lobang_id = lobang_comments.lobang_id and r.user_id = auth.uid()
      )
    )
  );

-- Push throttle, same shape as claim_vote_push_window
-- (038_vote_push_throttle.sql) — a live back-and-forth shouldn't push
-- every other participant on every single message, just the first one in
-- a ~10 minute window. SECURITY DEFINER since lobangs has had no
-- authenticated UPDATE policy at all since 019_lobang_group_send.sql
-- dropped it (seen_at moved to lobang_recipients), and whoever's posting a
-- comment is very often not that row's own from_user_id.
alter table lobangs
  add column if not exists last_comment_push_at timestamptz;

create or replace function claim_lobang_comment_push_window(
  p_lobang_id uuid,
  p_window_seconds int default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  update lobangs
  set last_comment_push_at = now()
  where id = p_lobang_id
    and (
      last_comment_push_at is null
      or last_comment_push_at < now() - (p_window_seconds || ' seconds')::interval
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

grant execute on function claim_lobang_comment_push_window(uuid, int) to authenticated;
