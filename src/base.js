import { SELECT_TYPES } from './constants'

export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 10)

export const WORKSPACE_COLORS = [
  { bg: '#ede9fe', accent: '#7c3aed' },
  { bg: '#dbeafe', accent: '#2563eb' },
  { bg: '#dcfce7', accent: '#16a34a' },
  { bg: '#fef9c3', accent: '#ca8a04' },
  { bg: '#ffedd5', accent: '#ea580c' },
  { bg: '#fee2e2', accent: '#e11d48' },
  { bg: '#fce7f3', accent: '#db2777' },
  { bg: '#cffafe', accent: '#0891b2' },
]

export function newField(name, type, extra = {}) {
  const f = { id: uid('fld'), name, type, ...extra }
  if (SELECT_TYPES.includes(type) && !f.options) f.options = []
  return f
}

export function newRecord(cells = {}) {
  return { id: uid('rec'), cells }
}

export function newView(name, type) {
  return {
    id: uid('viw'),
    name,
    type, // 'grid' | 'kanban' | 'gallery'
    sort: null,
    filters: [],
    hidden: [],
    groupField: null,
  }
}

/** Empty table used inside a new workspace. */
export function emptyTable(name = 'Table 1') {
  const nameField = newField('Name', 'text')
  const notes = newField('Notes', 'longText')
  const grid = newView('Grid', 'grid')
  return {
    id: uid('tbl'),
    name,
    fields: [nameField, notes],
    records: [newRecord(), newRecord()],
    views: [grid],
    activeViewId: grid.id,
    primaryFieldId: nameField.id,
  }
}

/** Starter tables (Tasks sample) for the first / demo workspace. */
export function starterTables() {
  const status = newField('Status', 'singleSelect', {
    options: [
      { id: uid('opt'), name: 'Todo', color: 5 },
      { id: uid('opt'), name: 'In progress', color: 1 },
      { id: uid('opt'), name: 'Done', color: 3 },
    ],
  })
  const tags = newField('Tags', 'multiSelect', {
    options: [
      { id: uid('opt'), name: 'Design', color: 0 },
      { id: uid('opt'), name: 'Bug', color: 6 },
      { id: uid('opt'), name: 'Idea', color: 4 },
    ],
  })
  const name = newField('Name', 'text')
  const notes = newField('Notes', 'longText')
  const done = newField('Done', 'checkbox')
  const priority = newField('Priority', 'rating')
  const due = newField('Due', 'date')
  const fields = [name, status, tags, priority, due, done, notes]

  const mk = (n, st, tg, pr, dt, dn, nt) =>
    newRecord({
      [name.id]: n,
      [status.id]: st,
      [tags.id]: tg,
      [priority.id]: pr,
      [due.id]: dt,
      [done.id]: dn,
      [notes.id]: nt,
    })

  const records = [
    mk('Onboarding flow', status.options[1].id, [tags.options[0].id], 4, '', false, 'Polish the sign-up screen.'),
    mk('Fix proxy bug', status.options[0].id, [tags.options[1].id], 5, '', false, 'Auth prompt on shadow windows.'),
    mk('Kanban view', status.options[2].id, [tags.options[2].id, tags.options[0].id], 3, '', true, 'Drag cards between stacks.'),
  ]

  const grid = newView('Grid', 'grid')
  const kanban = newView('Kanban', 'kanban')
  kanban.groupField = status.id
  const gallery = newView('Gallery', 'gallery')

  return [{
    id: uid('tbl'),
    name: 'Tasks',
    fields,
    records,
    views: [grid, kanban, gallery],
    activeViewId: grid.id,
    primaryFieldId: name.id,
  }]
}

export function newWorkspace(name, { starter = false, color } = {}) {
  const tables = starter ? starterTables() : [emptyTable()]
  return {
    id: uid('ws'),
    name: name || 'Untitled Workspace',
    color: color ?? Math.floor(Math.random() * WORKSPACE_COLORS.length),
    openedAt: new Date().toISOString(),
    tables,
    activeTableId: tables[0].id,
  }
}

export function defaultStore() {
  const ws = newWorkspace('My Workspace', { starter: true, color: 0 })
  return { workspaces: [ws], proxyLists: [] }
}

// A "Proxy Grabber" list: a named pool of proxy links Sessions 4 grabs from when creating
// containers. Lives at the top level of the account document so Sessions 4 reads/consumes it.
export function newProxyList(name = 'Proxy list') {
  return { id: uid('pxl'), name: String(name || 'Proxy list'), proxies: [] }
}

// Keep only non-empty, de-duplicated proxy lines (order preserved).
export function cleanProxyLines(text) {
  const seen = new Set()
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || seen.has(line)) continue
    seen.add(line)
    out.push(line)
  }
  return out
}

// Normalize the stored proxyLists array (defensive against older/partial docs).
export function normalizeProxyLists(lists) {
  if (!Array.isArray(lists)) return []
  return lists.map((l) => ({
    id: l && l.id ? l.id : uid('pxl'),
    name: (l && l.name) ? String(l.name) : 'Proxy list',
    proxies: Array.isArray(l && l.proxies) ? l.proxies.map((p) => String(p || '').trim()).filter(Boolean) : [],
  }))
}

// The "Container" text column (created by Sessions 4) always leads the sheet, so it's
// the first column everywhere it renders. Reordering fields is safe — views, hidden
// lists, and cells all reference field ids, never positions.
function orderContainerFirst(table) {
  if (!table || !Array.isArray(table.fields)) return table
  const idx = table.fields.findIndex(
    (f) => f && f.type === 'text' && String(f.name || '').trim().toLowerCase() === 'container'
  )
  if (idx <= 0) return table
  const fields = [...table.fields]
  const [container] = fields.splice(idx, 1)
  fields.unshift(container)
  return { ...table, fields }
}

/** Accept legacy single-base `{ tables }` or the new `{ workspaces }` shape. */
export function normalizeStore(data) {
  // The VPN "send to phone" pointer is a top-level extra kept verbatim so it syncs
  // from desktop to the phone through the same document.
  const vpnTarget = data && data.vpnTarget && typeof data.vpnTarget === 'object' ? data.vpnTarget : undefined
  // Proxy Grabber lists are a top-level extra kept verbatim so they sync with Sessions 4.
  const proxyLists = normalizeProxyLists(data && data.proxyLists)
  if (data && Array.isArray(data.workspaces) && data.workspaces.length) {
    return {
      vpnTarget,
      proxyLists,
      workspaces: data.workspaces.map((w) => ({
        id: w.id || uid('ws'),
        name: w.name || 'Untitled Workspace',
        color: typeof w.color === 'number' ? w.color : 0,
        openedAt: w.openedAt || new Date().toISOString(),
        tables: (Array.isArray(w.tables) && w.tables.length ? w.tables : [emptyTable()]).map(orderContainerFirst),
        activeTableId: w.activeTableId || (w.tables && w.tables[0] && w.tables[0].id) || null,
      })),
    }
  }
  if (data && Array.isArray(data.tables) && data.tables.length) {
    return {
      proxyLists,
      workspaces: [{
        id: uid('ws'),
        name: 'Untitled Workspace',
        color: 0,
        openedAt: new Date().toISOString(),
        tables: data.tables.map(orderContainerFirst),
        activeTableId: data.activeTableId || data.tables[0].id,
      }],
    }
  }
  return defaultStore()
}

// Back-compat alias used by older imports
export function defaultBase() {
  const tables = starterTables()
  return { tables, activeTableId: tables[0].id }
}

export function displayValue(field, value) {
  if (value == null) return ''
  switch (field.type) {
    case 'checkbox':
      return value ? 'checked' : ''
    case 'singleSelect': {
      const o = (field.options || []).find((x) => x.id === value)
      return o ? o.name : ''
    }
    case 'multiSelect': {
      const ids = Array.isArray(value) ? value : []
      return (field.options || []).filter((o) => ids.includes(o.id)).map((o) => o.name).join(', ')
    }
    case 'rating':
      return String(value || 0)
    default:
      return String(value)
  }
}

// Field types whose raw cell value is plain text — safe targets for spreadsheet-style paste.
export const TEXT_FIELD_TYPES = ['text', 'longText', 'number', 'email', 'url', 'phone']

export function emptyValueFor(type) {
  if (type === 'checkbox') return false
  if (type === 'multiSelect') return []
  if (type === 'rating') return 0
  if (type === 'singleSelect') return null
  return ''
}

export function formatOpened(iso) {
  if (!iso) return 'Never opened'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Never opened'
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Opened just now'
  if (mins < 60) return `Opened ${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Opened ${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Opened yesterday'
  if (days < 7) return `Opened ${days}d ago`
  return `Opened ${d.toLocaleDateString()}`
}
