import { useState } from 'react'
import { optionColor } from '../constants'
import { displayValue } from '../base'

// Groups records into stacks by a single-select field. Cards drag between stacks.
export default function KanbanView({ table, view, records, api, onExpand }) {
  const [dragId, setDragId] = useState(null)
  const groupField = table.fields.find((f) => f.id === view.groupField && f.type === 'singleSelect')
  const otherFields = table.fields.filter((f) => f.id !== table.primaryFieldId && f.id !== groupField?.id).slice(0, 3)

  if (!groupField) {
    const selectFields = table.fields.filter((f) => f.type === 'singleSelect')
    return (
      <div className="kanban-empty">
        <p>Kanban groups records by a single-select field.</p>
        {selectFields.length ? (
          <div className="ke-choices">
            {selectFields.map((f) => (
              <button key={f.id} className="btn primary sm" onClick={() => api.updateView(table.id, view.id, { groupField: f.id })}>
                Group by “{f.name}”
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">Add a single-select field first (e.g. a Status field).</p>
        )}
      </div>
    )
  }

  const stacks = [
    { id: null, name: 'Uncategorized', color: null },
    ...groupField.options.map((o) => ({ id: o.id, name: o.name, color: o.color })),
  ]

  function drop(stackId) {
    if (dragId) api.updateCell(table.id, dragId, groupField.id, stackId)
    setDragId(null)
  }

  return (
    <div className="kanban">
      {stacks.map((stack) => {
        const cards = records.filter((r) => (r.cells[groupField.id] || null) === stack.id)
        const c = stack.color != null ? optionColor(stack) : null
        return (
          <div className="kstack" key={String(stack.id)}
            onDragOver={(e) => e.preventDefault()} onDrop={() => drop(stack.id)}>
            <div className="kstack-head">
              <span className="tag" style={c ? { background: c.bg, color: c.text } : { background: '#eef0f4', color: '#4b5563' }}>{stack.name}</span>
              <span className="kcount">{cards.length}</span>
            </div>
            <div className="kstack-body">
              {cards.map((rec) => (
                <div key={rec.id} className="kcard" draggable
                  onDragStart={() => setDragId(rec.id)} onClick={() => onExpand(rec.id)}>
                  <div className="kcard-title">{rec.cells[table.primaryFieldId] || 'Untitled'}</div>
                  {otherFields.map((f) => {
                    const dv = displayValue(f, rec.cells[f.id])
                    if (!dv) return null
                    return <div className="kcard-meta" key={f.id}><span className="km-label">{f.name}</span>{dv}</div>
                  })}
                </div>
              ))}
              <button className="kcard-add" onClick={() => api.addRecord(table.id, { [groupField.id]: stack.id })}>+ Add</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
