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

-- ── Workspace sharing ─────────────────────────────────────────────────────────
-- The owner generates a share code for one workspace. Other accounts redeem the
-- code (join_workspace_share RPC) and become members: membership grants them
-- read/write access to the owner's sheet document, and the PWA shows only the
-- shared workspace from it.

create table if not exists public.workspace_shares (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  ws_id      text not null,           -- workspace id inside the owner's sheet JSON
  code       text not null unique,
  created_at timestamptz not null default now(),
  unique (owner_id, ws_id)
);

create table if not exists public.workspace_share_members (
  share_id  uuid not null references public.workspace_shares (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (share_id, user_id)
);

-- SECURITY DEFINER helpers keep the policies below from recursing into each other.
create or replace function public.is_share_owner(share uuid)
returns boolean language sql security definer stable set search_path = public as
$$ select exists (select 1 from workspace_shares where id = share and owner_id = auth.uid()) $$;

create or replace function public.shares_doc_with_me(owner uuid)
returns boolean language sql security definer stable set search_path = public as
$$ select exists (
     select 1 from workspace_shares s
     join workspace_share_members m on m.share_id = s.id
     where s.owner_id = owner and m.user_id = auth.uid()
   ) $$;

alter table public.workspace_shares enable row level security;
alter table public.workspace_share_members enable row level security;

drop policy if exists "shares_owner_all" on public.workspace_shares;
create policy "shares_owner_all" on public.workspace_shares
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "shares_member_select" on public.workspace_shares;
create policy "shares_member_select" on public.workspace_shares
  for select using (
    exists (select 1 from public.workspace_share_members m
            where m.share_id = id and m.user_id = auth.uid())
  );

drop policy if exists "members_select" on public.workspace_share_members;
create policy "members_select" on public.workspace_share_members
  for select using (user_id = auth.uid() or public.is_share_owner(share_id));

drop policy if exists "members_leave" on public.workspace_share_members;
create policy "members_leave" on public.workspace_share_members
  for delete using (user_id = auth.uid() or public.is_share_owner(share_id));

-- Members read and write the owner's sheet document (the PWA writes back the whole
-- document with only the shared workspace changed).
drop policy if exists "sheets_select_shared" on public.sheets;
create policy "sheets_select_shared" on public.sheets
  for select using (public.shares_doc_with_me(user_id));

drop policy if exists "sheets_update_shared" on public.sheets;
create policy "sheets_update_shared" on public.sheets
  for update using (public.shares_doc_with_me(user_id))
  with check (public.shares_doc_with_me(user_id));

-- Redeem a share code. Runs as definer so the code can be looked up without
-- exposing the shares table to non-members.
create or replace function public.join_workspace_share(share_code text)
returns table (share_id uuid, owner_id uuid, ws_id text)
language plpgsql security definer set search_path = public as $$
declare s public.workspace_shares%rowtype;
begin
  select * into s from workspace_shares w
    where upper(replace(w.code, '-', '')) = upper(replace(trim(share_code), '-', ''));
  if s.id is null then
    raise exception 'Invalid share code';
  end if;
  if s.owner_id <> auth.uid() then
    insert into workspace_share_members (share_id, user_id)
      values (s.id, auth.uid())
      on conflict do nothing;
  end if;
  return query select s.id, s.owner_id, s.ws_id;
end $$;

grant execute on function public.join_workspace_share(text) to authenticated;

-- ── Cross-account launch links ────────────────────────────────────────────────
-- Launch links behave like capability URLs: the token is 18 random bytes, and the
-- only way another account learns it is through a workspace shared with them (the
-- row's rocket button). So any signed-in user who presents the exact token may
-- fetch — or delete — that link, letting shared-workspace members launch each
-- other's containers from their own Sessions 4 account.

create or replace function public.get_session_link(link_token text)
returns table (label text, payload jsonb)
language sql security definer stable set search_path = public as
$$ select l.label, l.payload from session_links l where l.token = link_token $$;

grant execute on function public.get_session_link(text) to authenticated;

create or replace function public.delete_session_link(link_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p jsonb;
begin
  delete from session_links where token = link_token returning payload into p;
  return p;
end $$;

grant execute on function public.delete_session_link(text) to authenticated;

-- ── Image Selector album (Sessions 4 "Auto" feature) ──────────────────────────
-- Images the Auto window's "Image Selector" node feeds into a page's file dialog.
-- Stored per account (base64 in `data`, small preview in `thumb`) so the album
-- follows the Sessions 4 login to any PC. `is_default` marks the image the node
-- uses; the app keeps at most one default per account.

-- ── Auto Control (multi-PC node-graph execution) ──────────────────────────────
-- One control document per account (`auto_control`): the published node graph plus
-- the latest run/stop command. Every running Sessions 4 instance ("engine") keeps a
-- row in `auto_engines` alive with a 1-second heartbeat carrying its per-node run
-- progress. The Sessions Table PWA renders the graph, shows which engines are
-- online (by code), executes them, and draws per-node completion bars.

create table if not exists public.auto_control (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  graph      jsonb not null default '{}'::jsonb,
  graph_name text not null default '',
  command    text not null default '',       -- 'run' | 'stop' | ''
  run_id     text not null default '',
  targets    jsonb not null default '[]'::jsonb, -- engine codes; [] = every online engine
  command_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.auto_control enable row level security;

drop policy if exists "auto_control_manage_own" on public.auto_control;
create policy "auto_control_manage_own" on public.auto_control
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.auto_engines (
  id         uuid primary key,               -- per-boot instance id (engine supplies it)
  user_id    uuid not null references auth.users (id) on delete cascade,
  code       text not null default '',       -- stable engine code shown in the PWA
  name       text not null default '',       -- PC hostname
  nickname   text not null default '',       -- user-set label (editable from the PWA)
  status     text not null default 'idle',   -- idle | running | done | error
  run_id     text not null default '',
  node_id    text not null default '',       -- node currently executing
  done_nodes jsonb not null default '[]'::jsonb,
  error      text not null default '',
  last_seen  timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Existing databases: add the nickname column introduced later.
alter table public.auto_engines add column if not exists nickname text not null default '';

create index if not exists auto_engines_user_id_idx on public.auto_engines (user_id);

alter table public.auto_engines enable row level security;

drop policy if exists "auto_engines_manage_own" on public.auto_engines;
create policy "auto_engines_manage_own" on public.auto_engines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Shot check prompts: a Sessions 4 instance uploads a screenshot after a node ran
-- and waits; the PWA shows it as a notification badge and writes the decision back
-- ('' = pending, then 'continue' | 'retry' | 'xrestart'). The engine deletes the
-- row once the decision is consumed.
create table if not exists public.auto_shots (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  engine_code text not null default '',
  engine_name text not null default '',
  node_label  text not null default '',
  run_id      text not null default '',
  shot        text not null default '',   -- jpeg data URL
  decision    text not null default '',
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

create index if not exists auto_shots_user_id_idx on public.auto_shots (user_id);

alter table public.auto_shots enable row level security;

drop policy if exists "auto_shots_manage_own" on public.auto_shots;
create policy "auto_shots_manage_own" on public.auto_shots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.auto_images (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null default 'image',
  mime       text not null default 'image/jpeg',
  data       text not null,
  thumb      text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists auto_images_user_id_idx on public.auto_images (user_id);

alter table public.auto_images enable row level security;

drop policy if exists "auto_images_manage_own" on public.auto_images;
create policy "auto_images_manage_own" on public.auto_images
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
