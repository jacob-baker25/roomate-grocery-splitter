create extension if not exists pgcrypto;

create table if not exists public.trip_groups (
  id uuid primary key,
  access_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key,
  access_key text not null unique,
  trip_group_id uuid references public.trip_groups(id) on delete cascade,
  payer_participant_id uuid,
  store_name text,
  receipt_date text,
  receipt_subtotal_cents integer,
  receipt_tax_cents integer not null default 0,
  receipt_total_cents integer,
  created_at timestamptz not null default now()
);

alter table public.trips
  add column if not exists trip_group_id uuid references public.trip_groups(id) on delete cascade;

create index if not exists trips_trip_group_id_idx on public.trips(trip_group_id);

create table if not exists public.participants (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  sort_order integer not null,
  responded boolean not null default false
);

create table if not exists public.items (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  item_code text,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  original_price_cents integer not null check (original_price_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  quantity integer not null default 1 check (quantity >= 1),
  sort_order integer not null
);

create table if not exists public.selections (
  trip_id uuid not null references public.trips(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  primary key (trip_id, participant_id, item_id)
);

alter table public.trips enable row level security;
alter table public.trip_groups enable row level security;
alter table public.participants enable row level security;
alter table public.items enable row level security;
alter table public.selections enable row level security;

-- No public policies are intentionally created. The app's server-side API uses a
-- Supabase secret/service-role key. Never expose that key to browser code.
