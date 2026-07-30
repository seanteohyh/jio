-- 001_offices.sql
-- The anchor points everything else measures distance from.
-- Idempotent: safe to re-run.

create table if not exists offices (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  lat        double precision not null,
  lng        double precision not null,
  created_at timestamptz default now()
);

-- The default office. The fixed UUID matches DEFAULT_OFFICE.id in
-- src/lib/constants.ts, so seeded data lines up on a fresh database.
insert into offices (id, name, address, lat, lng)
values (
  '00000000-0000-0000-0000-000000000001',
  'LazadaOne',
  '51 Bras Basah Road, Singapore 189554',
  1.2966,
  103.8520
)
on conflict (id) do nothing;
