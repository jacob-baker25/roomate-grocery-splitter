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
  split_mode text not null default 'choice' check (split_mode in ('choice', 'everyone', 'custom')),
  sort_order integer not null
);

create table if not exists public.product_names (
  item_code text primary key,
  receipt_name text,
  display_name text not null,
  source text not null default 'user' check (source in ('seed', 'user', 'online')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.product_names (item_code, display_name, source, confidence)
values
  ('1150189', 'SkinnyPop Organic Popcorn', 'seed', 1),
  ('1424237', 'Kirkland Grass-Fed Salted Butter', 'seed', 1),
  ('33724', 'Ground Beef 88% Lean / 12% Fat', 'seed', 1),
  ('1193444', 'Kirkland Red Plastic Cups', 'seed', 1),
  ('637598', 'Kirkland Large Cage-Free Eggs', 'seed', 1),
  ('47292', 'Wild Sockeye Salmon Fillet', 'seed', 1),
  ('1701671', 'Kirkland Scented Kitchen Trash Bags', 'seed', 1),
  ('58685', '4C Seasoned Bread Crumbs', 'seed', 1),
  ('1446716', 'Grilled Chipotle Seasoned Chicken', 'seed', 1),
  ('1963389', 'Miami Beef Grass-Fed Ground Beef', 'seed', 1),
  ('33841', 'Kirkland Boneless Skinless Chicken Breasts', 'seed', 1),
  ('1737607', 'Real Good Chicken & Pepper Jack Burritos', 'seed', 1),
  ('1831841', 'Goodles Mac & Cheese Variety Pack', 'seed', 1),
  ('428409', 'Gold Star Membership Renewal', 'seed', 1),
  ('1602320', 'Kirkland Organic Ground Paprika', 'seed', 1),
  ('848008', 'McCormick Garlic Powder', 'seed', 1),
  ('992756', 'Kraft Grated Parmesan Cheese', 'seed', 1),
  ('803428', 'Barilla Thin Spaghetti', 'seed', 1),
  ('1919326', 'Bounty Advanced Paper Towels', 'seed', 1),
  ('2067029', 'Tide Pods Unstopables Laundry Detergent, Fresh, 80-count', 'seed', 1),
  ('2848101', 'Cascade Complete Shine Boost Dishwasher ActionPacs, Fresh, 92-count', 'seed', 1),
  ('1668206', 'Real Good Foods Lightly Breaded Chicken Strips, 3 lb', 'seed', 1),
  ('33593', 'USDA Choice Beef Loin New York Strip Steak', 'seed', 1),
  ('22041', 'Kirkland Boneless Skinless Chicken Thighs', 'seed', 1),
  ('1717856', 'Scotch-Brite Zero Scratch Sponges, 24-count', 'seed', 1),
  ('2046269', 'Mrs. Meyer''s Clean Day Hand Soap Variety Pack, 4-count', 'seed', 1),
  ('1478988', 'Kinder''s Buttery Garlic & Herb Seasoning', 'seed', 1),
  ('692731', 'Kirkland Organic Extra Virgin Olive Oil', 'seed', 1)
on conflict (item_code) do nothing;

create table if not exists public.selections (
  trip_id uuid not null references public.trips(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  weight integer not null default 1 check (weight > 0),
  primary key (trip_id, participant_id, item_id)
);

alter table public.trips enable row level security;
alter table public.trip_groups enable row level security;
alter table public.participants enable row level security;
alter table public.items enable row level security;
alter table public.selections enable row level security;
alter table public.product_names enable row level security;

-- No public policies are intentionally created. The app's server-side API uses a
-- Supabase secret/service-role key. Never expose that key to browser code.
