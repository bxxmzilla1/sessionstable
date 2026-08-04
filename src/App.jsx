import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './components/Auth'
import Home from './components/Home'
import TableTabs from './components/TableTabs'
import ViewBar from './components/ViewBar'
import ViewSidebar from './components/ViewSidebar'
import GridView from './components/GridView'
import KanbanView from './components/KanbanView'
import GalleryView from './components/GalleryView'
import RecordModal from './components/RecordModal'
import {
  displayValue, emptyTable, newField, newRecord, newView, newWorkspace,
  normalizeStore, uid,
} from './base'
import { OPTION_PALETTE } from './constants'

function matchFilter(field, value, op, target) {
  const dv = displayValue(field, value).toLowerCase()
  const t = String(target ?? '').toLowerCase()
  const num = Number(value || 0)
  const tnum = Number(target || 0)
  switch (op) {
    case 'contains': return dv.includes(t)
    case 'notContains': return !dv.includes(t)
    case 'is': return field.type === 'number' || field.type === 'rating' ? num === tnum : dv === t
    case 'isNot': return field.type === 'number' || field.type === 'rating' ? num !== tnum : dv !== t
    case 'lt': return num < tnum
    case 'gt': return num > tnum
    case 'lte': return num <= tnum
    case 'gte': return num >= tnum
    case 'empty': return dv === ''
    case 'notEmpty': return dv !== ''
    case 'checked': return !!value
    case 'unchecked': return !value
    default: return true
  }
}

function processRecords(table, view, search) {
  const byId = (id) => table.fields.find((f) => f.id === id)
  let recs = table.records
  for (const flt of view.filters || []) {
    const f = byId(flt.field)
    if (!f) continue
    recs = recs.filter((r) => matchFilter(f, r.cells[f.id], flt.op, flt.value))
  }
  const q = search.trim().toLowerCase()
  if (q) recs = recs.filter((r) => table.fields.some((f) => displayValue(f, r.cells[f.id]).toLowerCase().includes(q)))
  if (view.sort) {
    const f = byId(view.sort.field)
    if (f) {
      const dir = view.sort.dir === 'asc' ? 1 : -1
      recs = [...recs].sort((a, b) => {
        if (f.type === 'number' || f.type === 'rating') return (Number(a.cells[f.id] || 0) - Number(b.cells[f.id] || 0)) * dir
        const av = displayValue(f, a.cells[f.id]).toLowerCase()
        const bv = displayValue(f, b.cells[f.id]).toLowerCase()
        return av < bv ? -dir : av > bv ? dir : 0
      })
    }
  }
  return recs
}

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [store, setStore] = useState(null)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null)
  const [status, setStatus] = useState('idle')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const saveTimer = useRef(null)
  const loadedFor = useRef(null)
  const lastRemoteStamp = useRef(null) // updated_at of the last version we loaded or saved
  const statusRef = useRef('idle')
  useEffect(() => { statusRef.current = status }, [status])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) { setStore(null); setActiveWorkspaceId(null); loadedFor.current = null; return }
    if (loadedFor.current === session.user.id) return
    loadedFor.current = session.user.id
    ;(async () => {
      const { data, error } = await supabase.from('sheets').select('data, updated_at').eq('user_id', session.user.id).maybeSingle()
      if (error) { console.error(error); setStore(normalizeStore(null)); return }
      lastRemoteStamp.current = data?.updated_at || null
      const normalized = normalizeStore(data?.data || null)
      setStore(normalized)
      // Land back in the workspace that was open before the refresh (until manually exited).
      let saved = null
      try { saved = localStorage.getItem('st_ws_' + session.user.id) } catch (e) {}
      setActiveWorkspaceId(saved && normalized.workspaces.some((w) => w.id === saved) ? saved : null)
    })()
  }, [session])

  // Remember the open workspace across refreshes; cleared when the user exits to Home.
  const setWorkspace = useCallback((id) => {
    setActiveWorkspaceId(id)
    try {
      if (!session?.user) return
      const key = 'st_ws_' + session.user.id
      if (id) localStorage.setItem(key, id)
      else localStorage.removeItem(key)
    } catch (e) {}
  }, [session])

  // Live-sync: the Sessions 4 desktop app writes rows into this same document (connected
  // containers, XPaste, XSave). Poll updated_at and pull the fresh document whenever someone
  // else saved — skipped while local edits are still flushing so they aren't clobbered.
  useEffect(() => {
    if (!session?.user) return
    let stopped = false
    const tick = async () => {
      if (stopped || statusRef.current === 'saving') return
      try {
        const { data } = await supabase.from('sheets').select('updated_at').eq('user_id', session.user.id).maybeSingle()
        const stamp = data?.updated_at
        if (!stamp || stamp === lastRemoteStamp.current) return
        if (stopped || statusRef.current === 'saving') return
        const { data: full } = await supabase.from('sheets').select('data, updated_at').eq('user_id', session.user.id).maybeSingle()
        if (stopped || statusRef.current === 'saving' || !full?.updated_at) return
        lastRemoteStamp.current = full.updated_at
        setStore(normalizeStore(full.data || null))
      } catch (e) { console.error(e) }
    }
    const id = setInterval(tick, 1000)
    return () => { stopped = true; clearInterval(id) }
  }, [session])

  const scheduleSave = useCallback((next) => {
    if (!session?.user) return
    setStatus('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const stamp = new Date().toISOString()
      const { error } = await supabase.from('sheets').upsert(
        { user_id: session.user.id, data: next, updated_at: stamp },
        { onConflict: 'user_id' }
      )
      // Remember our own save so the live-sync poll doesn't treat it as a remote change.
      if (!error) lastRemoteStamp.current = stamp
      setStatus(error ? 'error' : 'saved')
      if (error) console.error(error)
    }, 600)
  }, [session])

  const update = useCallback((mutator) => {
    setStore((prev) => { const next = mutator(prev); scheduleSave(next); return next })
  }, [scheduleSave])

  const mutateWorkspace = useCallback((fn) => {
    if (!activeWorkspaceId) return
    update((s) => ({
      ...s,
      workspaces: s.workspaces.map((w) => (w.id === activeWorkspaceId ? fn(w) : w)),
    }))
  }, [update, activeWorkspaceId])

  const mutateTable = useCallback((tableId, fn) => {
    mutateWorkspace((w) => ({
      ...w,
      tables: w.tables.map((t) => (t.id === tableId ? fn(t) : t)),
    }))
  }, [mutateWorkspace])

  const openWorkspace = useCallback((id) => {
    setSearch('')
    setExpandedId(null)
    setWorkspace(id)
    update((s) => ({
      ...s,
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, openedAt: new Date().toISOString() } : w)),
    }))
  }, [update, setWorkspace])

  const createWorkspace = useCallback(() => {
    const ws = newWorkspace('Untitled Workspace')
    update((s) => ({ ...s, workspaces: [...s.workspaces, ws] }))
    setWorkspace(ws.id)
    setSearch('')
    setExpandedId(null)
  }, [update, setWorkspace])

  const renameWorkspace = useCallback((id, name) => {
    update((s) => ({
      ...s,
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name: (name || '').trim() || w.name } : w)),
    }))
  }, [update])

  const deleteWorkspace = useCallback((id) => {
    update((s) => {
      const workspaces = s.workspaces.filter((w) => w.id !== id)
      return { ...s, workspaces }
    })
    if (activeWorkspaceId === id) setWorkspace(null)
  }, [update, activeWorkspaceId, setWorkspace])

  const api = useMemo(() => ({
    addTable() {
      mutateWorkspace((w) => {
        const t = emptyTable('Table ' + (w.tables.length + 1))
        // emptyTable already has Name/Notes — rename for clarity
        return { ...w, tables: [...w.tables, t], activeTableId: t.id }
      })
    },
    renameTable(id, name) { mutateTable(id, (t) => ({ ...t, name: (name || '').trim() || t.name })) },
    deleteTable(id) {
      mutateWorkspace((w) => {
        if (w.tables.length <= 1) return w
        const tables = w.tables.filter((t) => t.id !== id)
        return { ...w, tables, activeTableId: w.activeTableId === id ? tables[0].id : w.activeTableId }
      })
    },
    setActiveTable(id) { mutateWorkspace((w) => ({ ...w, activeTableId: id })) },

    addView(tableId, type) {
      mutateTable(tableId, (t) => {
        const count = t.views.filter((v) => v.type === type).length
        const v = newView(type[0].toUpperCase() + type.slice(1) + (count ? ' ' + (count + 1) : ''), type)
        if (type === 'kanban') v.groupField = t.fields.find((f) => f.type === 'singleSelect')?.id || null
        return { ...t, views: [...t.views, v], activeViewId: v.id }
      })
    },
    deleteView(tableId, viewId) {
      mutateTable(tableId, (t) => {
        if (t.views.length <= 1) return t
        const views = t.views.filter((v) => v.id !== viewId)
        return { ...t, views, activeViewId: t.activeViewId === viewId ? views[0].id : t.activeViewId }
      })
    },
    setActiveView(tableId, viewId) { mutateTable(tableId, (t) => ({ ...t, activeViewId: viewId })) },
    updateView(tableId, viewId, patch) {
      mutateTable(tableId, (t) => ({ ...t, views: t.views.map((v) => (v.id === viewId ? { ...v, ...patch } : v)) }))
    },
    addFilter(tableId, viewId, filter) {
      mutateTable(tableId, (t) => ({ ...t, views: t.views.map((v) => (v.id === viewId ? { ...v, filters: [...v.filters, filter] } : v)) }))
    },
    updateFilter(tableId, viewId, filterId, patch) {
      mutateTable(tableId, (t) => ({ ...t, views: t.views.map((v) => (v.id === viewId ? { ...v, filters: v.filters.map((f) => (f.id === filterId ? { ...f, ...patch } : f)) } : v)) }))
    },
    removeFilter(tableId, viewId, filterId) {
      mutateTable(tableId, (t) => ({ ...t, views: t.views.map((v) => (v.id === viewId ? { ...v, filters: v.filters.filter((f) => f.id !== filterId) } : v)) }))
    },

    addField(tableId, patch) {
      mutateTable(tableId, (t) => ({ ...t, fields: [...t.fields, newField(patch.name, patch.type, patch.options ? { options: patch.options } : {})] }))
    },
    updateField(tableId, fieldId, patch) {
      mutateTable(tableId, (t) => ({
        ...t,
        fields: t.fields.map((f) => {
          if (f.id !== fieldId) return f
          const next = { ...f, name: patch.name ?? f.name, type: patch.type ?? f.type }
          if (['singleSelect', 'multiSelect'].includes(next.type)) next.options = patch.options ?? f.options ?? []
          else delete next.options
          return next
        }),
      }))
    },
    deleteField(tableId, fieldId) {
      mutateTable(tableId, (t) => {
        if (t.fields.length <= 1) return t
        const fields = t.fields.filter((f) => f.id !== fieldId)
        const primaryFieldId = t.primaryFieldId === fieldId ? fields[0].id : t.primaryFieldId
        const views = t.views.map((v) => ({
          ...v,
          hidden: v.hidden.filter((x) => x !== fieldId),
          sort: v.sort?.field === fieldId ? null : v.sort,
          groupField: v.groupField === fieldId ? null : v.groupField,
          filters: v.filters.filter((f) => f.field !== fieldId),
        }))
        return { ...t, fields, primaryFieldId, views }
      })
    },
    addSelectOption(tableId, fieldId, name) {
      const id = uid('opt')
      mutateTable(tableId, (t) => ({
        ...t,
        fields: t.fields.map((f) => {
          if (f.id !== fieldId) return f
          const opts = f.options || []
          return { ...f, options: [...opts, { id, name, color: opts.length % OPTION_PALETTE.length }] }
        }),
      }))
      return id
    },

    addRecord(tableId, preset = {}) { mutateTable(tableId, (t) => ({ ...t, records: [...t.records, newRecord({ ...preset })] })) },
    updateCell(tableId, recordId, fieldId, value) {
      mutateTable(tableId, (t) => ({ ...t, records: t.records.map((r) => (r.id === recordId ? { ...r, cells: { ...r.cells, [fieldId]: value } } : r)) }))
    },
    deleteRecord(tableId, recordId) { mutateTable(tableId, (t) => ({ ...t, records: t.records.filter((r) => r.id !== recordId) })) },
  }), [mutateWorkspace, mutateTable])

  if (!ready) return <div className="center muted">Loading…</div>
  if (!session) return <Auth />
  if (!store) return <div className="center muted">Opening your workspaces…</div>

  // ── Home ──
  if (!activeWorkspaceId) {
    return (
      <div className="app">
        <Home
          store={store}
          onOpen={openWorkspace}
          onCreate={createWorkspace}
          onRename={renameWorkspace}
          onDelete={deleteWorkspace}
        />
      </div>
    )
  }

  const workspace = store.workspaces.find((w) => w.id === activeWorkspaceId)
  if (!workspace) {
    return (
      <div className="center muted">
        Workspace not found. <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => setWorkspace(null)}>Back to Home</button>
      </div>
    )
  }

  const table = workspace.tables.find((t) => t.id === workspace.activeTableId) || workspace.tables[0]
  const view = table.views.find((v) => v.id === table.activeViewId) || table.views[0]
  const records = processRecords(table, view, search)
  const expanded = expandedId ? table.records.find((r) => r.id === expandedId) : null

  // TableTabs expects `{ tables, activeTableId }` — the workspace itself matches that shape.
  const base = workspace

  return (
    <div className="app">
      <header className="topbar">
        <button className="home-back" onClick={() => setWorkspace(null)} title="Back to Home">← Home</button>
        <div className="brand ws-brand">
          <span className="logo" aria-hidden="true">▦</span>
          <span className="ws-top-name" title={workspace.name}>{workspace.name}</span>
        </div>
        <div className="grow" />
        <span className={'save ' + status}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'All changes saved' : status === 'error' ? 'Save failed' : ''}
        </span>
        <span className="email" title={session.user.email}>{session.user.email}</span>
        <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <TableTabs base={base} api={api} />
      <ViewBar table={table} view={view} api={api} search={search} onSearch={setSearch}
        sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((s) => !s)} />

      <div className="body">
        {sidebarOpen && <ViewSidebar table={table} api={api} />}
        <div className="workspace">
          {view.type === 'grid' && <GridView table={table} view={view} records={records} api={api} onExpand={setExpandedId} />}
          {view.type === 'kanban' && <KanbanView table={table} view={view} records={records} api={api} onExpand={setExpandedId} />}
          {view.type === 'gallery' && <GalleryView table={table} view={view} records={records} api={api} onExpand={setExpandedId} />}
        </div>
      </div>

      {expanded && (
        <RecordModal
          table={table}
          record={expanded}
          onCell={(rid, fid, v) => api.updateCell(table.id, rid, fid, v)}
          onAddOption={(fid, nm) => api.addSelectOption(table.id, fid, nm)}
          onDelete={(rid) => api.deleteRecord(table.id, rid)}
          onClose={() => setExpandedId(null)}
        />
      )}
    </div>
  )
}
