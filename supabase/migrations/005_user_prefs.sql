-- 005_user_prefs.sql
-- Explicit taste, as opposed to the taste the recommender infers from ratings.
-- Both feed the scoring; explicit preferences just weigh more.

create table if not exists user_prefs (
  user_id           uuid primary key,
  cuisine_likes     text[] default '{}',
  cuisine_dislikes  text[] default '{}',
  budget_min        smallint default 1,
  budget_max        smallint default 4,
  -- Places this user never wants suggested. Hard exclusion, not a penalty.
  blocklist         uuid[] default '{}',
  default_office_id uuid
);
