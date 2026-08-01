import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './components/Auth'
import TableTabs from './components/TableTabs'
import ViewBar from './components/ViewBar'
import ViewSidebar from './components/ViewSidebar'
import GridView from './components/GridView'
import KanbanView from './components/KanbanView'
import GalleryView from './components/GalleryView'
import RecordModal from './components/RecordModal'
import { defaultBase, displayValue, newField, newRecord, newView, uid } from './base'
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
  const [base, setBase] = useState(null)
  const [status, setStatus] = useState('idle')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const saveTimer = useRef(null)
  const loadedFor = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) { setBase(null); loadedFor.current = null; return }
    if (loadedFor.current === session.user.id) return
    loadedFor.current = session.user.id
    ;(async () => {
      const { data, error } = await supabase.from('sheets').select('data').eq('user_id', session.user.id).maybeSingle()
      if (error) { console.error(error); setBase(defaultBase()); return }
      setBase(data?.data?.tables ? data.data : defaultBase())
    })()
  }, [session])

  const scheduleSave = useCallback((next) => {
    if (!session?.user) return
    setStatus('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase.from('sheets').upsert(
        { user_id: session.user.id, data: next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      setStatus(error ? 'error' : 'saved')
      if (error) console.error(error)
    }, 600)
  }, [session])

  const update = useCallback((mutator) => {
    setBase((prev) => { const next = mutator(prev); scheduleSave(next); return next })
  }, [scheduleSave])

  const mutateTable = useCallback((tableId, fn) => {
    update((b) => ({ ...b, tables: b.tables.map((t) => (t.id === tableId ? fn(t) : t)) }))
  }, [update])

  const api = useMemo(() => ({
    // Tables
    addTable() {
      update((b) => {
        const name = newField('Name', 'text')
        const notes = newField('Notes', 'longText')
        const grid = newView('Grid', 'grid')
        const t = { id: uid('tbl'), name: 'Table ' + (b.tables.length + 1), fields: [name, notes], records: [newRecord(), newRecord()], views: [grid], activeViewId: grid.id, primaryFieldId: name.id }
        return { ...b, tables: [...b.tables, t], activeTableId: t.id }
      })
    },
    renameTable(id, name) { mutateTable(id, (t) => ({ ...t, name: (name || '').trim() || t.name })) },
    deleteTable(id) {
      update((b) => {
        if (b.tables.length <= 1) return b
        const tables = b.tables.filter((t) => t.id !== id)
        return { ...b, tables, activeTableId: b.activeTableId === id ? tables[0].id : b.activeTableId }
      })
    },
    setActiveTable(id) { update((b) => ({ ...b, activeTableId: id })) },

    // Views
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

    // Fields
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

    // Records
    addRecord(tableId, preset = {}) { mutateTable(tableId, (t) => ({ ...t, records: [...t.records, newRecord({ ...preset })] })) },
    updateCell(tableId, recordId, fieldId, value) {
      mutateTable(tableId, (t) => ({ ...t, records: t.records.map((r) => (r.id === recordId ? { ...r, cells: { ...r.cells, [fieldId]: value } } : r)) }))
    },
    deleteRecord(tableId, recordId) { mutateTable(tableId, (t) => ({ ...t, records: t.records.filter((r) => r.id !== recordId) })) },
  }), [update, mutateTable])

  if (!ready) return <div className="center muted">Loading…</div>
  if (!session) return <Auth />
  if (!base) return <div className="center muted">Opening your base…</div>

  const table = base.tables.find((t) => t.id === base.activeTableId) || base.tables[0]
  const view = table.views.find((v) => v.id === table.activeViewId) || table.views[0]
  const records = processRecords(table, view, search)
  const expanded = expandedId ? table.records.find((r) => r.id === expandedId) : null

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo" aria-hidden="true">▦</span> Sessions Table</div>
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
