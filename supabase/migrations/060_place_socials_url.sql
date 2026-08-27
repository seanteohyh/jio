-- 060_place_socials_url.sql
--
-- CHANGES_20260821b.md §1 — an optional link to a place's socials
-- (Instagram, Facebook, whatever). Decided as "Socials," not "Instagram":
-- one link, not locked to one platform, stored as the full URL exactly as
-- pasted rather than normalized to any one platform's handle format.
--
-- Manual-only, no auto-resolution: unlike Google Places (a real "search any
-- business by name" API), there is no equivalent third-party lookup for
-- Instagram or Facebook that could resolve this the way
-- resolveAndStoreGooglePlaceId does — confirmed against current API docs,
-- not just assumed. Same class as `notes`: nullable, no format constraint
-- beyond what the app's own input validates, editable by anyone who can
-- edit the place at all (027_place_editing.sql's grant already covers any
-- column not explicitly excluded — `status` and `google_place_id` are; this
-- isn't).
alter table places add column if not exists socials_url text;

-- ------------------------------------------------------- re-derive grants --
-- 027_place_editing.sql's column-level GRANT is a snapshot taken when it
-- ran — a column added afterward is invisible to `authenticated`'s
-- privileges until the GRANT is re-issued (033/049 both hit this and
-- re-derive verbatim; same step here, or this ships as another repeat of
-- 027 §1's original "permission denied for table places" bug, just for
-- socials_url specifically). Not excluded from the list below — this is
-- freely editable by anyone who can edit the place at all, not
-- system-computed like google_place_id.
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
        'osm_id', 'source',
        'google_place_id'
      );

  execute 'revoke update on places from authenticated';
  execute format('grant update (%s) on places to authenticated', v_cols);
end $$;
