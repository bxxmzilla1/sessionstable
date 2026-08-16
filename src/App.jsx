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
import SettingsModal from './components/SettingsModal'
import { ShareModal, JoinModal } from './components/ShareModal'
import ConfirmModal from './components/ConfirmModal'
import VpnScreen from './components/VpnScreen'
import ProxyGrabber from './components/ProxyGrabber'
import AutoControl from './components/AutoControl'
import FooterNav from './components/FooterNav'
import Icon from './Icon'
import { deleteBundleTeams } from './bundle'
import {
  displayValue, emptyTable, isReadOnlyField, newField, newProxyList, newRecord, newView, newWorkspace,
  normalizeStore, uid, TEXT_FIELD_TYPES,
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

function genShareCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O/1/I/L lookalikes
  const buf = new Uint32Array(8)
  crypto.getRandomValues(buf)
  return [...buf].map((n) => chars[n % chars.length]).join('')
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
  // The views panel starts closed on phones — it overlays the grid there as a drawer.
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [vpnOpen, setVpnOpen] = useState(false)
  const [vpnPreset, setVpnPreset] = useState(null)
  const [proxyOpen, setProxyOpen] = useState(false)
  const [autoOpen, setAutoOpen] = useState(false)
  const [flash, setFlash] = useState('')
  // Workspace sharing: share rows visible to me (mine + ones I've joined), and the
  // sheet documents of owners who shared a workspace with me.
  const [shares, setShares] = useState([])
  const [foreignDocs, setForeignDocs] = useState({}) // ownerId -> normalized store
  const [shareWsId, setShareWsId] = useState(null) // workspace whose share modal is open
  const [joinOpen, setJoinOpen] = useState(false)
  const [confirmBox, setConfirmBox] = useState(null) // { title, message, confirmLabel, onConfirm }
  const sharesRef = useRef([])
  const sharesJson = useRef(null)
  const foreignDocsRef = useRef({})
  const foreignStamps = useRef({}) // ownerId -> updated_at we last loaded/saved
  const foreignSaveTimers = useRef({})
  const foreignSaving = useRef(new Set())
  const vpnSeeded = useRef(false)
  const vpnSeenAt = useRef(null)
  const gridClipboard = useRef(null) // in-app clipboard: survives switching tab sheets
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

  // The active tab sheet is a PER-DEVICE choice. The synced document also carries an
  // activeTableId, but any remote write (Sessions 4 stamping a timestamp, the phone
  // sitting on another tab) used to yank this device over to that tab. The local pick
  // wins; the synced value is only a fallback for workspaces never opened here.
  const [localTabs, setLocalTabs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('st_tabs') || '{}') || {} } catch (e) { return {} }
  })
  const rememberTab = useCallback((wsId, tableId) => {
    if (!wsId || !tableId) return
    setLocalTabs((prev) => {
      if (prev[wsId] === tableId) return prev
      const next = { ...prev, [wsId]: tableId }
      try { localStorage.setItem('st_tabs', JSON.stringify(next)) } catch (e) {}
      return next
    })
  }, [])

  useEffect(() => { sharesRef.current = shares }, [shares])
  useEffect(() => { foreignDocsRef.current = foreignDocs }, [foreignDocs])

  // ── Workspace sharing ──
  const loadForeignDoc = useCallback(async (ownerId) => {
    try {
      const { data } = await supabase.from('sheets').select('data, updated_at').eq('user_id', ownerId).maybeSingle()
      if (!data?.updated_at) return
      foreignStamps.current[ownerId] = data.updated_at
      setForeignDocs((prev) => ({ ...prev, [ownerId]: normalizeStore(data.data || null) }))
    } catch (e) { console.error(e) }
  }, [])

  // Pull the share rows I can see (mine + joined) and make sure every foreign
  // owner's document is loaded. State only changes when the rows actually differ.
  const refreshShares = useCallback(async () => {
    if (!session?.user) return
    try {
      const { data } = await supabase.from('workspace_shares').select('id, owner_id, ws_id, code')
      const rows = data || []
      const json = JSON.stringify(rows)
      if (json !== sharesJson.current) {
        sharesJson.current = json
        setShares(rows)
      }
      const owners = [...new Set(rows.filter((r) => r.owner_id !== session.user.id).map((r) => r.owner_id))]
      for (const o of owners) if (!foreignStamps.current[o]) await loadForeignDoc(o)
    } catch (e) { console.error(e) }
  }, [session, loadForeignDoc])

  useEffect(() => {
    if (!session?.user) { setShares([]); setForeignDocs({}); sharesJson.current = null; foreignStamps.current = {}; return }
    refreshShares()
  }, [session, refreshShares])

  // Debounced write-back of a shared owner's document (whole doc, one workspace changed).
  const scheduleForeignSave = useCallback((ownerId) => {
    setStatus('saving')
    foreignSaving.current.add(ownerId)
    clearTimeout(foreignSaveTimers.current[ownerId])
    foreignSaveTimers.current[ownerId] = setTimeout(async () => {
      const doc = foreignDocsRef.current[ownerId]
      if (!doc) { foreignSaving.current.delete(ownerId); return }
      const stamp = new Date().toISOString()
      const { error } = await supabase.from('sheets').update({ data: doc, updated_at: stamp }).eq('user_id', ownerId)
      if (!error) foreignStamps.current[ownerId] = stamp
      foreignSaving.current.delete(ownerId)
      setStatus(error ? 'error' : 'saved')
      if (error) console.error(error)
    }, 600)
  }, [])

  const mutateForeignWs = useCallback((ownerId, wsId, fn) => {
    setForeignDocs((prev) => {
      const doc = prev[ownerId]
      if (!doc) return prev
      return { ...prev, [ownerId]: { ...doc, workspaces: doc.workspaces.map((w) => (w.id === wsId ? fn(w) : w)) } }
    })
    scheduleForeignSave(ownerId)
  }, [scheduleForeignSave])

  // A workspace is "foreign" when it reaches me through someone else's share.
  const foreignShareFor = useCallback((wsId) => (
    sharesRef.current.find((r) => r.ws_id === wsId && r.owner_id !== session?.user?.id) || null
  ), [session])

  // Live-sync: the Sessions 4 desktop app writes rows into this same document (connected
  // containers, XPaste, XSave). Poll updated_at and pull the fresh document whenever someone
  // else saved — skipped while local edits are still flushing so they aren't clobbered.
  useEffect(() => {
    if (!session?.user) return
    let stopped = false
    const tick = async () => {
      if (stopped) return
      // Shared workspaces: new shares/joins/revocations, plus edits made by the
      // other accounts inside the owners' documents.
      try {
        await refreshShares()
        const owners = [...new Set(sharesRef.current.filter((r) => r.owner_id !== session.user.id).map((r) => r.owner_id))]
        if (owners.length) {
          const { data: metas } = await supabase.from('sheets').select('user_id, updated_at').in('user_id', owners)
          for (const m of metas || []) {
            if (stopped || foreignSaving.current.has(m.user_id)) continue
            if (m.updated_at && m.updated_at !== foreignStamps.current[m.user_id]) await loadForeignDoc(m.user_id)
          }
        }
      } catch (e) { console.error(e) }
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
  }, [session, refreshShares, loadForeignDoc])

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
    const foreign = foreignShareFor(activeWorkspaceId)
    if (foreign) { mutateForeignWs(foreign.owner_id, activeWorkspaceId, fn); return }
    update((s) => ({
      ...s,
      workspaces: s.workspaces.map((w) => (w.id === activeWorkspaceId ? fn(w) : w)),
    }))
  }, [update, activeWorkspaceId, foreignShareFor, mutateForeignWs])

  const mutateTable = useCallback((tableId, fn) => {
    mutateWorkspace((w) => ({
      ...w,
      tables: w.tables.map((t) => (t.id === tableId ? fn(t) : t)),
    }))
  }, [mutateWorkspace])

  // ── Undo / redo (Ctrl+Z / Ctrl+Shift+Z) ──
  // Every DATA edit (cells, rows, columns) captures a before/after snapshot of the table
  // it touched. Undo walks back through those snapshots, redo replays them. View config
  // (sort/filter/hide) is intentionally not tracked. History resets per workspace.
  // Besides plain table edits, entries can carry a `kind`:
  //   'ws-delete' — a whole workspace was deleted (undo re-inserts it at its old position)
  //   'ws-tables' — a tab sheet was deleted (undo restores the workspace's table list)
  const history = useRef({ undo: [], redo: [] })
  const histToken = useRef(0)
  const histPushed = useRef(0)
  useEffect(() => { history.current = { undo: [], redo: [] } }, [activeWorkspaceId])

  const snapTable = (t) => structuredClone({ fields: t.fields, records: t.records, primaryFieldId: t.primaryFieldId })

  const mutateTableTracked = useCallback((tableId, fn) => {
    const token = ++histToken.current
    mutateTable(tableId, (t) => {
      const next = fn(t)
      // histPushed guards against React double-invoking the updater (StrictMode).
      if (next !== t && histPushed.current !== token) {
        histPushed.current = token
        history.current.undo.push({ tableId, before: snapTable(t), after: snapTable(next) })
        if (history.current.undo.length > 100) history.current.undo.shift()
        history.current.redo = []
      }
      return next
    })
  }, [mutateTable])

  const applySnapshot = useCallback((tableId, snap) => {
    mutateTable(tableId, (t) => ({
      ...t,
      fields: structuredClone(snap.fields),
      records: structuredClone(snap.records),
      primaryFieldId: snap.primaryFieldId,
    }))
  }, [mutateTable])

  // Restore a workspace's whole table list (used by tab-sheet deletion undo/redo).
  // Routes to the owner's document when the workspace is shared with me.
  const applyWsTables = useCallback((wsId, snap) => {
    const fn = (w) => ({ ...w, tables: structuredClone(snap.tables), activeTableId: snap.activeTableId })
    const foreign = foreignShareFor(wsId)
    if (foreign) { mutateForeignWs(foreign.owner_id, wsId, fn); return }
    update((s) => ({ ...s, workspaces: s.workspaces.map((w) => (w.id === wsId ? fn(w) : w)) }))
  }, [foreignShareFor, mutateForeignWs, update])

  // Put a deleted workspace back where it was (share codes and cloud launch links
  // are NOT recreated — only the workspace data itself comes back).
  const reinsertWorkspace = useCallback((entry) => {
    update((s) => {
      if (s.workspaces.some((w) => w.id === entry.workspace.id)) return s
      const workspaces = [...s.workspaces]
      workspaces.splice(Math.min(entry.index, workspaces.length), 0, structuredClone(entry.workspace))
      return { ...s, workspaces }
    })
  }, [update])

  const removeWorkspaceById = useCallback((id) => {
    update((s) => ({ ...s, workspaces: s.workspaces.filter((w) => w.id !== id) }))
  }, [update])

  const undoEdit = useCallback(() => {
    const entry = history.current.undo.pop()
    if (!entry) { setFlash('Nothing to undo'); setTimeout(() => setFlash(''), 1200); return }
    history.current.redo.push(entry)
    if (entry.kind === 'ws-delete') reinsertWorkspace(entry)
    else if (entry.kind === 'ws-tables') applyWsTables(entry.wsId, entry.before)
    else applySnapshot(entry.tableId, entry.before)
    setFlash(entry.kind === 'ws-delete' ? 'Workspace restored' : entry.kind === 'ws-tables' ? 'Tab sheet restored' : 'Undone')
    setTimeout(() => setFlash(''), 1200)
  }, [applySnapshot, applyWsTables, reinsertWorkspace])

  const redoEdit = useCallback(() => {
    const entry = history.current.redo.pop()
    if (!entry) { setFlash('Nothing to redo'); setTimeout(() => setFlash(''), 1200); return }
    history.current.undo.push(entry)
    if (entry.kind === 'ws-delete') removeWorkspaceById(entry.workspace.id)
    else if (entry.kind === 'ws-tables') applyWsTables(entry.wsId, entry.after)
    else applySnapshot(entry.tableId, entry.after)
    setFlash('Redone')
    setTimeout(() => setFlash(''), 1200)
  }, [applySnapshot, applyWsTables, removeWorkspaceById])

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.key !== 'z' && e.key !== 'Z') return
      const el = document.activeElement
      // Inside an input the browser's own text undo should win.
      if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return
      e.preventDefault()
      if (e.shiftKey) redoEdit()
      else undoEdit()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [undoEdit, redoEdit])

  const openWorkspace = useCallback((id) => {
    setSearch('')
    setExpandedId(null)
    setWorkspace(id)
    if (foreignShareFor(id)) return // don't stamp openedAt into someone else's document
    update((s) => ({
      ...s,
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, openedAt: new Date().toISOString() } : w)),
    }))
  }, [update, setWorkspace, foreignShareFor])

  const createWorkspace = useCallback(() => {
    const ws = newWorkspace('Untitled Workspace')
    update((s) => ({ ...s, workspaces: [...s.workspaces, ws] }))
    setWorkspace(ws.id)
    setSearch('')
    setExpandedId(null)
  }, [update, setWorkspace])

  const renameWorkspace = useCallback((id, name) => {
    const clean = (name || '').trim()
    const foreign = foreignShareFor(id)
    if (foreign) { mutateForeignWs(foreign.owner_id, id, (w) => ({ ...w, name: clean || w.name })); return }
    update((s) => ({
      ...s,
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name: clean || w.name } : w)),
    }))
  }, [update, foreignShareFor, mutateForeignWs])

  // Desktop "send to phone": stamp a VPN target into the synced document. The phone,
  // already polling every second, opens its VPN screen pre-selected to this exact row.
  const sendToVpn = useCallback((tableId, recordId) => {
    update((s) => ({ ...s, vpnTarget: { wsId: activeWorkspaceId, tableId, recordId, at: Date.now() } }))
    setFlash('Sent to VPN on your phone')
    setTimeout(() => setFlash(''), 1800)
  }, [update, activeWorkspaceId])

  // ── Proxy Grabber: named pools of proxy links Sessions 4 grabs from ──
  const createProxyList = useCallback((name) => {
    const list = newProxyList(name)
    update((s) => ({ ...s, proxyLists: [...(s.proxyLists || []), list] }))
    return list.id
  }, [update])

  const renameProxyList = useCallback((id, name) => {
    const clean = (name || '').trim()
    if (!clean) return
    update((s) => ({ ...s, proxyLists: (s.proxyLists || []).map((l) => (l.id === id ? { ...l, name: clean } : l)) }))
  }, [update])

  const deleteProxyList = useCallback((id) => {
    update((s) => ({ ...s, proxyLists: (s.proxyLists || []).filter((l) => l.id !== id) }))
  }, [update])

  const setProxyListProxies = useCallback((id, proxies) => {
    update((s) => ({ ...s, proxyLists: (s.proxyLists || []).map((l) => (l.id === id ? { ...l, proxies } : l)) }))
  }, [update])

  // Receiving end: when the synced vpnTarget changes, a phone jumps straight to the VPN
  // screen with that row selected. Seeded on first load so a stale target never auto-opens.
  useEffect(() => {
    const at = store?.vpnTarget?.at || null
    if (!vpnSeeded.current) { vpnSeeded.current = true; vpnSeenAt.current = at; return }
    if (at && at !== vpnSeenAt.current) {
      vpnSeenAt.current = at
      if (typeof window !== 'undefined' && window.innerWidth <= 768) {
        setVpnPreset({ ...store.vpnTarget })
        setVpnOpen(true)
      }
    }
  }, [store])

  // Deleting a row (or a table/workspace containing rows) that Sessions 4 saved also deletes the
  // matching cloud launch links AND their bundle.social teams — the "vice versa" of Sessions 4
  // deleting the row when a launch link is removed. Idempotent, so a double-invoked updater in
  // dev strict mode is harmless (the second pass finds no links left to read).
  const deleteLaunchTokens = useCallback((tokens) => {
    const list = [...new Set((tokens || []).filter(Boolean))]
    if (!list.length || !session?.user) return
    ;(async () => {
      // Read the payloads first — they carry each container's bundle.social team id.
      let teamIds = []
      try {
        const { data } = await supabase.from('session_links')
          .select('payload').eq('user_id', session.user.id).in('token', list)
        teamIds = (data || []).map((r) => r?.payload?.bundleTeamId).filter(Boolean)
      } catch (e) { console.error(e) }
      const { error } = await supabase.from('session_links')
        .delete().eq('user_id', session.user.id).in('token', list)
      if (error) console.error(error)
      // Best-effort — failures logged, never blocking (e.g. no API key configured yet).
      const res = await deleteBundleTeams(teamIds)
      if (res.errors.length) console.warn('[bundle team delete]', res.errors)
    })()
  }, [session])

  const deleteWorkspace = useCallback(async (id) => {
    // A shared workspace someone else owns: "delete" just means leave the share.
    const foreign = foreignShareFor(id)
    if (foreign) {
      try {
        await supabase.from('workspace_share_members').delete().eq('share_id', foreign.id).eq('user_id', session.user.id)
      } catch (e) { console.error(e) }
      sharesJson.current = null
      setShares((prev) => prev.filter((r) => r.id !== foreign.id))
      if (activeWorkspaceId === id) setWorkspace(null)
      return
    }
    // My own: revoke its share (if any) so members lose access, then delete it.
    const mine = sharesRef.current.find((r) => r.ws_id === id && r.owner_id === session?.user?.id)
    if (mine) {
      try { await supabase.from('workspace_shares').delete().eq('id', mine.id) } catch (e) { console.error(e) }
      sharesJson.current = null
      setShares((prev) => prev.filter((r) => r.id !== mine.id))
    }
    const token = ++histToken.current
    update((s) => {
      const index = s.workspaces.findIndex((w) => w.id === id)
      if (index < 0) return s
      const gone = s.workspaces[index]
      deleteLaunchTokens((gone.tables || []).flatMap((t) => (t.records || []).map((r) => r.launch?.token)))
      // Ctrl+Z can bring the workspace back (data only — share codes / launch links stay gone).
      if (histPushed.current !== token) {
        histPushed.current = token
        history.current.undo.push({ kind: 'ws-delete', index, workspace: structuredClone(gone) })
        if (history.current.undo.length > 100) history.current.undo.shift()
        history.current.redo = []
      }
      const workspaces = s.workspaces.filter((w) => w.id !== id)
      return { ...s, workspaces }
    })
    if (activeWorkspaceId === id) setWorkspace(null)
  }, [update, activeWorkspaceId, setWorkspace, deleteLaunchTokens, foreignShareFor, session])

  // Owner: create (or reopen) the share code for a workspace.
  const shareWorkspace = useCallback(async (wsId) => {
    const existing = sharesRef.current.find((r) => r.ws_id === wsId && r.owner_id === session?.user?.id)
    if (existing) { setShareWsId(wsId); return }
    try {
      const { data, error } = await supabase.from('workspace_shares')
        .insert({ owner_id: session.user.id, ws_id: wsId, code: genShareCode() })
        .select('id, owner_id, ws_id, code')
        .single()
      if (error) throw error
      sharesJson.current = null
      setShares((prev) => [...prev, data])
      setShareWsId(wsId)
    } catch (e) {
      console.error(e)
      setFlash('Could not create a share code')
      setTimeout(() => setFlash(''), 1800)
    }
  }, [session])

  const revokeShare = useCallback(async (wsId) => {
    const row = sharesRef.current.find((r) => r.ws_id === wsId && r.owner_id === session?.user?.id)
    if (row) {
      try { await supabase.from('workspace_shares').delete().eq('id', row.id) } catch (e) { console.error(e) }
      sharesJson.current = null
      setShares((prev) => prev.filter((r) => r.id !== row.id))
    }
    setShareWsId(null)
    setFlash('Sharing stopped')
    setTimeout(() => setFlash(''), 1800)
  }, [session])

  // Joiner: redeem a code, load the owner's document, and open the workspace.
  const joinWorkspace = useCallback(async (code) => {
    const { data, error } = await supabase.rpc('join_workspace_share', { share_code: code })
    if (error) throw new Error(error.message?.includes('Invalid') ? 'Invalid share code' : (error.message || 'Could not join'))
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('Invalid share code')
    if (row.owner_id === session?.user?.id) throw new Error('That code is for your own workspace')
    await loadForeignDoc(row.owner_id)
    sharesJson.current = null
    await refreshShares()
    setWorkspace(row.ws_id)
    setFlash('Joined shared workspace')
    setTimeout(() => setFlash(''), 1800)
  }, [session, loadForeignDoc, refreshShares, setWorkspace])

  const api = useMemo(() => ({
    addTable() {
      mutateWorkspace((w) => {
        const t = emptyTable('Table ' + (w.tables.length + 1))
        // emptyTable already has Name/Notes — rename for clarity
        rememberTab(w.id, t.id)
        return { ...w, tables: [...w.tables, t], activeTableId: t.id }
      })
    },
    renameTable(id, name) { mutateTable(id, (t) => ({ ...t, name: (name || '').trim() || t.name })) },
    deleteTable(id) {
      const token = ++histToken.current
      mutateWorkspace((w) => {
        if (w.tables.length <= 1) return w
        const gone = w.tables.find((t) => t.id === id)
        if (!gone) return w
        deleteLaunchTokens((gone.records || []).map((r) => r.launch?.token))
        const tables = w.tables.filter((t) => t.id !== id)
        const next = { ...w, tables, activeTableId: w.activeTableId === id ? tables[0].id : w.activeTableId }
        // Ctrl+Z restores the tab sheet (rows included; cloud launch links stay gone).
        if (histPushed.current !== token) {
          histPushed.current = token
          history.current.undo.push({
            kind: 'ws-tables',
            wsId: w.id,
            before: structuredClone({ tables: w.tables, activeTableId: w.activeTableId }),
            after: structuredClone({ tables: next.tables, activeTableId: next.activeTableId }),
          })
          if (history.current.undo.length > 100) history.current.undo.shift()
          history.current.redo = []
        }
        return next
      })
    },
    setActiveTable(id) {
      rememberTab(activeWorkspaceId, id)
      mutateWorkspace((w) => ({ ...w, activeTableId: id }))
    },

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
      mutateTableTracked(tableId, (t) => ({ ...t, fields: [...t.fields, newField(patch.name, patch.type, patch.options ? { options: patch.options } : {})] }))
    },
    updateField(tableId, fieldId, patch) {
      mutateTableTracked(tableId, (t) => ({
        ...t,
        fields: t.fields.map((f) => {
          if (f.id !== fieldId) return f
          const next = { ...f, name: patch.name ?? f.name, type: patch.type ?? f.type }
          if (patch.width !== undefined) next.width = patch.width // saved with the sheet → synced to the account
          if (['singleSelect', 'multiSelect'].includes(next.type)) next.options = patch.options ?? f.options ?? []
          else delete next.options
          return next
        }),
      }))
    },
    deleteField(tableId, fieldId) {
      mutateTableTracked(tableId, (t) => {
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
      mutateTableTracked(tableId, (t) => ({
        ...t,
        fields: t.fields.map((f) => {
          if (f.id !== fieldId) return f
          const opts = f.options || []
          return { ...f, options: [...opts, { id, name, color: opts.length % OPTION_PALETTE.length }] }
        }),
      }))
      return id
    },

    addRecord(tableId, preset = {}) { mutateTableTracked(tableId, (t) => ({ ...t, records: [...t.records, newRecord({ ...preset })] })) },
    updateCell(tableId, recordId, fieldId, value) {
      mutateTableTracked(tableId, (t) => ({ ...t, records: t.records.map((r) => (r.id === recordId ? { ...r, cells: { ...r.cells, [fieldId]: value } } : r)) }))
    },
    deleteRecord(tableId, recordId) {
      mutateTableTracked(tableId, (t) => {
        const rec = t.records.find((r) => r.id === recordId)
        if (rec?.launch?.token) deleteLaunchTokens([rec.launch.token])
        return { ...t, records: t.records.filter((r) => r.id !== recordId) }
      })
    },
    // Set many cells at once: entries = [{ recordId, fieldId, value }].
    setCellsBulk(tableId, entries) {
      if (!entries || !entries.length) return
      mutateTableTracked(tableId, (t) => {
        const patch = new Map()
        for (const { recordId, fieldId, value } of entries) {
          if (!patch.has(recordId)) patch.set(recordId, {})
          patch.get(recordId)[fieldId] = value
        }
        return {
          ...t,
          records: t.records.map((r) => (patch.has(r.id) ? { ...r, cells: { ...r.cells, ...patch.get(r.id) } } : r)),
        }
      })
    },
    deleteRecords(tableId, recordIds) {
      const gone = new Set(recordIds || [])
      if (!gone.size) return
      mutateTableTracked(tableId, (t) => {
        const tokens = t.records.filter((r) => gone.has(r.id) && r.launch?.token).map((r) => r.launch.token)
        if (tokens.length) deleteLaunchTokens(tokens)
        return { ...t, records: t.records.filter((r) => !gone.has(r.id)) }
      })
    },
    // Paste copied rows (each keyed by column NAME) starting at `startRecordId`: overwrite
    // downward in the visible order (`orderedIds`), append new rows for leftovers. Column
    // names missing in this sheet are created as text so nothing is lost.
    pasteRows(tableId, startRecordId, rows, orderedIds) {
      if (!rows || !rows.length) return
      mutateTableTracked(tableId, (t) => {
        const fields = [...t.fields]
        const fieldFor = (name) => {
          let f = fields.find((x) => String(x.name || '').trim().toLowerCase() === String(name).trim().toLowerCase())
          if (!f) { f = newField(name, 'text'); fields.push(f) }
          return f
        }
        const records = t.records.map((r) => ({ ...r, cells: { ...r.cells } }))
        const byId = new Map(records.map((r) => [r.id, r]))
        const startIdx = orderedIds.indexOf(startRecordId)
        const targets = startIdx >= 0 ? orderedIds.slice(startIdx) : []
        rows.forEach((cellsByName, i) => {
          const entries = Object.entries(cellsByName || {}).filter(([n, v]) => n && v !== '' && v != null)
          if (!entries.length) return
          const cellObj = {}
          // Timestamp columns are never paste targets — Sessions 4 owns those values.
          for (const [name, value] of entries) {
            if (isReadOnlyField({ name })) continue
            cellObj[fieldFor(name).id] = value
          }
          if (!Object.keys(cellObj).length) return
          if (i < targets.length) {
            const rec = byId.get(targets[i])
            if (rec) Object.assign(rec.cells, cellObj)
          } else {
            records.push(newRecord(cellObj))
          }
        })
        return { ...t, fields, records }
      })
    },
    // Paste a 2D block of text starting at a cell: fills right across the visible columns
    // (`orderedFieldIds`) and down the visible rows, creating new rows when it runs out.
    // Non-text columns in the way are skipped (position is consumed, value dropped).
    pasteGrid(tableId, startRecordId, startFieldId, grid, orderedIds, orderedFieldIds) {
      if (!grid || !grid.length) return
      mutateTableTracked(tableId, (t) => {
        const colStart = orderedFieldIds.indexOf(startFieldId)
        if (colStart < 0) return t
        const fieldById = new Map(t.fields.map((f) => [f.id, f]))
        const records = t.records.map((r) => ({ ...r, cells: { ...r.cells } }))
        const byId = new Map(records.map((r) => [r.id, r]))
        const startIdx = orderedIds.indexOf(startRecordId)
        const targets = startIdx >= 0 ? orderedIds.slice(startIdx) : []
        grid.forEach((line, i) => {
          let rec = i < targets.length ? byId.get(targets[i]) : null
          if (!rec) { rec = newRecord({}); records.push(rec) }
          line.forEach((val, j) => {
            const fid = orderedFieldIds[colStart + j]
            const f = fid ? fieldById.get(fid) : null
            if (!f || !TEXT_FIELD_TYPES.includes(f.type) || isReadOnlyField(f)) return
            rec.cells[fid] = val
          })
        })
        return { ...t, records }
      })
    },
  }), [mutateWorkspace, mutateTable, mutateTableTracked, deleteLaunchTokens, rememberTab, activeWorkspaceId])

  // My own workspaces plus every workspace shared with me, as one list. Shared ones
  // carry `_shared` so the UI can badge them and route deletes to "leave".
  const myId = session?.user?.id
  const sharedWorkspaces = shares
    .filter((r) => r.owner_id !== myId)
    .map((r) => {
      const doc = foreignDocs[r.owner_id]
      const w = doc?.workspaces?.find((x) => x.id === r.ws_id)
      return w ? { ...w, _shared: { ownerId: r.owner_id, shareId: r.id } } : null
    })
    .filter(Boolean)
  const allWorkspaces = [...(store?.workspaces || []), ...sharedWorkspaces]
  const myCodes = Object.fromEntries(shares.filter((r) => r.owner_id === myId).map((r) => [r.ws_id, r.code]))

  if (!ready) return <div className="center muted">Loading…</div>
  if (!session) return <Auth />
  if (!store) return <div className="center muted">Opening your workspaces…</div>

  const footer = (
    <FooterNav
      active={vpnOpen ? 'vpn' : activeWorkspaceId ? 'workspace' : 'home'}
      onHome={() => { setVpnOpen(false); setWorkspace(null) }}
      onWorkspace={() => {
        setVpnOpen(false)
        if (!activeWorkspaceId) {
          const recent = [...allWorkspaces].sort((a, b) => new Date(b.openedAt || 0) - new Date(a.openedAt || 0))[0]
          if (recent) openWorkspace(recent.id)
        }
      }}
      onVpn={() => { setVpnPreset(null); setVpnOpen(true) }}
      onSettings={() => setSettingsOpen(true)}
    />
  )
  const overlays = (
    <>
      {vpnOpen && (
        <div className="vpn-overlay">
          <button className="vpn-close" onClick={() => setVpnOpen(false)} title="Close"><Icon name="close" size={18} /></button>
          <VpnScreen workspaces={allWorkspaces} preset={vpnPreset} onConsumePreset={() => setVpnPreset(null)} />
        </div>
      )}
      {autoOpen && (
        <div className="vpn-overlay">
          <button className="vpn-close" onClick={() => setAutoOpen(false)} title="Close"><Icon name="close" size={18} /></button>
          <AutoControl userId={session.user.id} />
        </div>
      )}
      {proxyOpen && (
        <div className="vpn-overlay">
          <button className="vpn-close" onClick={() => setProxyOpen(false)} title="Close"><Icon name="close" size={18} /></button>
          <ProxyGrabber
            lists={store?.proxyLists || []}
            onCreate={createProxyList}
            onRename={renameProxyList}
            onDelete={deleteProxyList}
            onSetProxies={setProxyListProxies}
          />
        </div>
      )}
      {flash && <div className="st-toast">{flash}</div>}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {shareWsId && (
        <ShareModal
          workspaceName={allWorkspaces.find((w) => w.id === shareWsId)?.name || 'Workspace'}
          code={myCodes[shareWsId] || ''}
          onRevoke={() => revokeShare(shareWsId)}
          onClose={() => setShareWsId(null)}
        />
      )}
      {joinOpen && <JoinModal onJoin={joinWorkspace} onClose={() => setJoinOpen(false)} />}
      {confirmBox && (
        <ConfirmModal
          title={confirmBox.title}
          message={confirmBox.message}
          confirmLabel={confirmBox.confirmLabel}
          onConfirm={confirmBox.onConfirm}
          onClose={() => setConfirmBox(null)}
        />
      )}
    </>
  )

  // ── Home ──
  if (!activeWorkspaceId) {
    return (
      <div className="app has-footer">
        <Home
          workspaces={allWorkspaces}
          sharedCodes={myCodes}
          onOpen={openWorkspace}
          onCreate={createWorkspace}
          onRename={renameWorkspace}
          onDelete={(id) => {
            const w = allWorkspaces.find((x) => x.id === id)
            const shared = !!w?._shared
            setConfirmBox({
              title: shared ? 'Leave shared workspace?' : 'Delete workspace?',
              message: shared
                ? `“${w?.name || 'This workspace'}” will disappear from your list. The owner keeps it and can share it with you again.`
                : `“${w?.name || 'This workspace'}” and all its tab sheets and rows will be deleted. Press Ctrl+Z right after if it was a mistake.`,
              confirmLabel: shared ? 'Leave' : 'Delete',
              onConfirm: () => deleteWorkspace(id),
            })
          }}
          onShare={shareWorkspace}
          onJoin={() => setJoinOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onProxy={() => setProxyOpen(true)}
          onAuto={() => setAutoOpen(true)}
        />
        {footer}
        {overlays}
      </div>
    )
  }

  const workspace = allWorkspaces.find((w) => w.id === activeWorkspaceId)
  if (!workspace) {
    return (
      <div className="center muted">
        Workspace not found. <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => setWorkspace(null)}>Back to Home</button>
      </div>
    )
  }

  // This device's remembered tab wins; the synced activeTableId (which other devices
  // and Sessions 4 writes move around) is only the fallback for never-opened workspaces.
  const localTab = localTabs[workspace.id]
  const activeTid = localTab && workspace.tables.some((t) => t.id === localTab) ? localTab : workspace.activeTableId
  const table = workspace.tables.find((t) => t.id === activeTid) || workspace.tables[0]
  const view = table.views.find((v) => v.id === table.activeViewId) || table.views[0]
  const records = processRecords(table, view, search)
  const expanded = expandedId ? table.records.find((r) => r.id === expandedId) : null

  // TableTabs expects `{ tables, activeTableId }` — same shape as the workspace, with
  // the active tab overridden by this device's pick.
  const base = { ...workspace, activeTableId: table.id }

  // "Total Accounts" — rows in this tab sheet whose "Creation Date & Time" is stamped
  // (i.e. accounts Sessions 4 actually saved with XSave). Hidden until the column exists.
  const creationField = table.fields.find((f) => String(f.name || '').trim().toLowerCase() === 'creation date & time')
  const totalAccounts = creationField
    ? table.records.filter((r) => String(r.cells?.[creationField.id] ?? '').trim() !== '').length
    : 0

  return (
    <div className="app has-footer">
      <header className="topbar">
        <button className="home-back" onClick={() => setWorkspace(null)} title="Back to Home"><Icon name="chevronLeft" size={15} /> Home</button>
        <div className="brand ws-brand">
          <span className="logo" aria-hidden="true"><Icon name="table" size={15} /></span>
          <span className="ws-top-name" title={workspace.name}>{workspace.name}</span>
          {(workspace._shared || myCodes[workspace.id]) && (
            <span className="ws-shared-badge">{workspace._shared ? 'Shared with you' : 'Shared'}</span>
          )}
        </div>
        {creationField && (
          <span className="total-accounts" title="Rows in this tab sheet with a Creation Date & Time stamp">
            Total Accounts: <b>{totalAccounts}</b>
          </span>
        )}
        <div className="grow" />
        <span className={'save ' + status}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'All changes saved' : status === 'error' ? 'Save failed' : ''}
        </span>
        <span className="email" title={session.user.email}>{session.user.email}</span>
        <button className="btn ghost sm icon-txt" onClick={() => setAutoOpen(true)} title="Auto Control — run the published Auto graph on every online Sessions 4 PC"><Icon name="bolt" size={15} /><span className="hide-sm">Auto Control</span></button>
        <button className="btn ghost sm icon-txt" onClick={() => setProxyOpen(true)} title="Proxy Grabber"><Icon name="vpn" size={15} /><span className="hide-sm">Proxy Grabber</span></button>
        <button className="btn ghost sm icon-txt" onClick={() => setSettingsOpen(true)} title="Settings"><Icon name="settings" size={15} /><span className="hide-sm">Settings</span></button>
        <button className="btn ghost sm icon-txt" onClick={() => supabase.auth.signOut()} title="Sign out"><Icon name="signout" size={15} /><span className="hide-sm">Sign out</span></button>
      </header>

      <TableTabs
        base={base}
        api={{
          ...api,
          // Intercept tab-sheet deletion with a confirmation before the real delete runs.
          deleteTable: (id) => {
            const t = workspace.tables.find((x) => x.id === id)
            setConfirmBox({
              title: 'Delete tab sheet?',
              message: `“${t?.name || 'This tab sheet'}” and all its rows will be deleted. Press Ctrl+Z right after if it was a mistake.`,
              confirmLabel: 'Delete',
              onConfirm: () => api.deleteTable(id),
            })
          },
        }}
      />
      <ViewBar table={table} view={view} api={api} search={search} onSearch={setSearch}
        sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((s) => !s)} />

      <div className="body">
        {sidebarOpen && <div className="side-scrim" onClick={() => setSidebarOpen(false)} />}
        {sidebarOpen && (
          <ViewSidebar
            table={table}
            api={api}
            // On phones the panel is an overlay — picking a view should reveal the grid again.
            onPick={() => { if (window.innerWidth <= 768) setSidebarOpen(false) }}
          />
        )}
        <div className="workspace">
          {view.type === 'grid' && <GridView table={table} view={view} records={records} api={api} clipboard={gridClipboard} onVpnSend={(rid) => sendToVpn(table.id, rid)} />}
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
      {footer}
      {overlays}
    </div>
  )
}
