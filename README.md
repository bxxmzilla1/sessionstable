# Sessions Table

An Airtable-style database **PWA** that shares accounts with the **Sessions 4** desktop app.
Sign in with the same Supabase account you use in Sessions 4, and you get your own
base (tables, fields, records, views) that autosaves to the cloud. Modern light theme,
purple accent, installable.

## Features

- **Shared login** — same Supabase project as Sessions 4, so the same email/password works.
- **One base per account** — data is stored per user in Supabase and protected by Row Level Security.
- **Tables** — multiple tables per account; add, rename (double-click a tab), delete.
- **Typed fields** — single line text, long text, number, checkbox, single/multiple select,
  date, email, URL, phone, and rating. Add, rename, re-type, hide, or delete fields.
- **Select options with colors** — Airtable-style colored tags, create options on the fly.
- **Records** — add, edit inline, expand a record into a full editor, delete.
- **Views** — Grid, Kanban (drag cards between stacks), and Gallery; create multiple views.
- **Search, filter, sort, group, hide fields** — per view.
- **Autosave** — debounced upserts to Supabase with a "Saving…/All changes saved" status.
- **PWA** — installable, offline app-shell via a service worker.

## 1. Supabase setup (once)

In the Supabase dashboard for your Sessions project, open the **SQL Editor** and run
[`supabase.sql`](./supabase.sql). It creates a `sheets` table (one row per user) with RLS.

The app already points at the Sessions project by default (the anon key is a public
client key). To use a different project, copy `.env.example` to `.env` and set your values.

## 2. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo:

   ```bash
   git init
   git add .
   git commit -m "Sessions Table PWA"
   git branch -M main
   git remote add origin https://github.com/<you>/sessions-table.git
   git push -u origin main
   ```

2. In Vercel, **Add New Project → Import** the repo. Vercel auto-detects Vite:
   - Build command: `vite build` (default)
   - Output directory: `dist` (default)

3. (Optional) Add env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under
   **Project → Settings → Environment Variables** if you want to override the defaults.

4. In Supabase → **Authentication → URL Configuration**, add your Vercel domain to the
   allowed redirect/site URLs.

## Tech

Vite + React, `@supabase/supabase-js`, a hand-rolled service worker + web manifest.
