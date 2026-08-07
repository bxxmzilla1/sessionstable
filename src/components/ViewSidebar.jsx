import { useState } from 'react'

const VIEW_ICON = { grid: '▦', kanban: '▤', gallery: '▢' }

// Left panel listing every view of the active table (Airtable-style), with
// "Create new…" and a find-a-view search.
export default function ViewSidebar({ table, api, onPick }) {
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)

  const views = table.views.filter((v) => v.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <aside className="view-sidebar">
      <div className="vs-create">
        <button className="vs-create-btn" onClick={() => setCreating((c) => !c)}>+ Create new…</button>
        {creating && (
          <div className="vs-create-menu">
            {['grid', 'kanban', 'gallery'].map((t) => (
              <button key={t} onClick={() => { api.addView(table.id, t); setCreating(false) }}>
                <span className="vicon">{VIEW_ICON[t]}</span>{t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="vs-search">
        <span className="vs-search-ic">⌕</span>
        <input placeholder="Find a view" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="vs-list">
        {views.map((v) => (
          <div key={v.id} className={'vs-item' + (v.id === table.activeViewId ? ' on' : '')}>
            {editing === v.id ? (
              <input
                autoFocus className="vs-edit" defaultValue={v.name}
                onBlur={(e) => { api.updateView(table.id, v.id, { name: e.target.value.trim() || v.name }); setEditing(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
            ) : (
              <button className="vs-pick" onClick={() => { api.setActiveView(table.id, v.id); onPick?.() }} onDoubleClick={() => setEditing(v.id)} title="Double-click to rename">
                <span className="vicon">{VIEW_ICON[v.type]}</span>
                <span className="vs-name">{v.name}</span>
              </button>
            )}
            {table.views.length > 1 && (
              <button className="vs-del" title="Delete view" onClick={() => api.deleteView(table.id, v.id)}>×</button>
            )}
          </div>
        ))}
        {!views.length && <div className="vs-empty">No views found</div>}
      </div>
    </aside>
  )
}
