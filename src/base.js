import { SELECT_TYPES } from './constants'

export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 10)

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
    sort: null, // { field, dir: 'asc' | 'desc' }
    filters: [], // [{ id, field, op, value }]
    hidden: [], // fieldIds hidden in this view
    groupField: null, // singleSelect fieldId for kanban stacks
  }
}

// A friendly starter base so a new account isn't staring at a blank screen.
export function defaultBase() {
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

  const table = {
    id: uid('tbl'),
    name: 'Tasks',
    fields,
    records,
    views: [grid, kanban, gallery],
    activeViewId: grid.id,
    primaryFieldId: name.id,
  }

  return { tables: [table], activeTableId: table.id }
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

export function emptyValueFor(type) {
  if (type === 'checkbox') return false
  if (type === 'multiSelect') return []
  if (type === 'rating') return 0
  if (type === 'singleSelect') return null
  return ''
}
