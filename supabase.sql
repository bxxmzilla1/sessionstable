-- Run this once in the Supabase SQL editor (same project as Sessions 4).
-- One spreadsheet per account, protected by Row Level Security so each user
-- can only read/write their own sheet.

create table if not exists public.sheets (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sheets enable row level security;

drop policy if exists "sheets_select_own" on public.sheets;
drop policy if exists "sheets_insert_own" on public.sheets;
drop policy if exists "sheets_update_own" on public.sheets;

create policy "sheets_select_own" on public.sheets
  for select using (auth.uid() = user_id);

create policy "sheets_insert_own" on public.sheets
  for insert with check (auth.uid() = user_id);

create policy "sheets_update_own" on public.sheets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
