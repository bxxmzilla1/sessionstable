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

-- ── Launch links ─────────────────────────────────────────────────────────────
-- Each launch link is a cloud snapshot of one container (cookies, proxy, fingerprint,
-- last URL). Sessions 4 creates/updates a row on XSave; the Sessions Table PWA's
-- "Launch Link" button opens sessions://open/<token>, which Sessions 4 restores into a
-- fresh window container. One row per container, keyed by a random token.

create extension if not exists "pgcrypto";

create table if not exists public.session_links (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  token      text not null unique,
  label      text not null default 'Launch link',
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_links_user_id_idx on public.session_links (user_id);
create unique index if not exists session_links_token_idx on public.session_links (token);

alter table public.session_links enable row level security;

drop policy if exists "session_links_manage_own" on public.session_links;
create policy "session_links_manage_own" on public.session_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
