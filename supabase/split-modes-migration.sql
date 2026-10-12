-- Run this once in the Supabase SQL editor before deploying split modes.

alter table public.items
  add column if not exists split_mode text not null default 'choice';

alter table public.items
  drop constraint if exists items_split_mode_check;

alter table public.items
  add constraint items_split_mode_check
  check (split_mode in ('choice', 'everyone', 'custom'));

alter table public.selections
  add column if not exists weight integer not null default 1;

alter table public.selections
  drop constraint if exists selections_weight_check;

alter table public.selections
  add constraint selections_weight_check
  check (weight > 0);
