-- 051_lobang_public_link.sql
-- CHANGES_20260816.md §4: "Share this lobang" — one entry point on the
-- place page, three paths (teammates, a whole Kaki, or "Anyone (get a
-- link)"). This migration is the third path's backing: a public send is a
-- `lobangs` row with no `lobang_recipients` rows at all — there's no
-- specific person, so there's nothing to fan out to.
--
-- `public_token` is what a stranger's browser presents at `/l/[token]` to
-- prove which row they're allowed to see. `get_public_lobang` resolves it
-- the same `SECURITY DEFINER` way `get_public_place` resolves a place id —
-- `lobangs_select` (007_rls.sql, fixed by 050) is `authenticated`-only, so
-- a signed-out visitor has no table privileges on `lobangs` at all, and
-- `from_display_name` has to be resolved server-side from the token to be
-- safe to show them — never a name typed into a client-editable URL.
--
-- No expiry/revocation, decided 16 Aug — a public lobang link lives as
-- long as the place row does, same as `/p/[id]`. `lobangs.place_id`
-- already cascades on place delete (016_lobangs.sql), so nothing extra is
-- needed for that half.

alter table lobangs add column if not exists public_token text unique;

create index if not exists lobangs_public_token_idx on lobangs (public_token)
  where public_token is not null;

create or replace function get_public_lobang(p_token text)
returns table (
  place_id uuid,
  name text,
  address text,
  cuisine text[],
  custom_cuisine_tags text[],
  budget_tier smallint,
  best_dishes text[],
  avg_rating numeric,
  visit_count integer,
  lat double precision,
  lng double precision,
  google_place_id text,
  from_display_name text,
  note text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      p.id,
      p.name,
      p.address,
      p.cuisine,
      p.custom_cuisine_tags,
      p.budget_tier,
      p.best_dishes,
      p.avg_rating,
      p.visit_count,
      p.lat,
      p.lng,
      p.google_place_id,
      coalesce(pr.display_name, 'A teammate'),
      l.note,
      l.created_at
    from lobangs l
    join places p on p.id = l.place_id
    left join profiles pr on pr.user_id = l.from_user_id
    where l.public_token = p_token
      and p.status = 'active';
end;
$$;

grant execute on function get_public_lobang(text) to anon, authenticated;
