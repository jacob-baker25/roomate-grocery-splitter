-- Run this once in the Supabase SQL editor for an existing Costco Splitter database.
-- It groups existing trips under one private list, then enables new trips to join it.

create extension if not exists pgcrypto;

create table if not exists public.trip_groups (
  id uuid primary key,
  access_key text not null unique,
  created_at timestamptz not null default now()
);

alter table public.trips
  add column if not exists trip_group_id uuid references public.trip_groups(id) on delete cascade;

create index if not exists trips_trip_group_id_idx on public.trips(trip_group_id);

insert into public.trip_groups (id, access_key)
select gen_random_uuid(), encode(gen_random_bytes(18), 'hex')
where exists (select 1 from public.trips where trip_group_id is null)
  and not exists (select 1 from public.trip_groups);

update public.trips
set trip_group_id = (select id from public.trip_groups order by created_at asc limit 1)
where trip_group_id is null;

alter table public.trip_groups enable row level security;
