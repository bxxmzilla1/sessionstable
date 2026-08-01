import { useState } from 'react'

export default function TableTabs({ base, api }) {
  const [editing, setEditing] = useState(null)

  return (
    <div className="table-tabs">
      {base.tables.map((t) => (
        <div key={t.id} className={'ttab' + (t.id === base.activeTableId ? ' on' : '')}>
          {editing === t.id ? (
            <input
              autoFocus className="ttab-edit" defaultValue={t.name}
              onBlur={(e) => { api.renameTable(t.id, e.target.value); setEditing(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            />
          ) : (
            <button
              className="ttab-btn"
              onClick={() => api.setActiveTable(t.id)}
              onDoubleClick={() => setEditing(t.id)}
              title="Double-click to rename"
            >
              {t.name}
            </button>
          )}
          {base.tables.length > 1 && t.id === base.activeTableId && (
            <button className="ttab-x" title="Delete table" onClick={() => api.deleteTable(t.id)}>×</button>
          )}
        </div>
      ))}
      <button className="ttab-add" title="Add table" onClick={() => api.addTable()}>+ Add table</button>
    </div>
  )
}
