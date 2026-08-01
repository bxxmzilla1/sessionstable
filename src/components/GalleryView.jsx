import { OPTION_PALETTE } from '../constants'
import { displayValue } from '../base'

// Card grid. Shows the primary field as a heading plus the next few fields.
export default function GalleryView({ table, view, records, api, onExpand }) {
  const fields = table.fields.filter((f) => f.id !== table.primaryFieldId && !view.hidden.includes(f.id)).slice(0, 5)

  return (
    <div className="gallery">
      {records.map((rec) => (
        <div key={rec.id} className="gcard" onClick={() => onExpand(rec.id)}>
          <div className="gcard-title">{rec.cells[table.primaryFieldId] || 'Untitled'}</div>
          <div className="gcard-fields">
            {fields.map((f) => {
              const val = rec.cells[f.id]
              if (f.type === 'singleSelect' || f.type === 'multiSelect') {
                const ids = f.type === 'multiSelect' ? (Array.isArray(val) ? val : []) : val ? [val] : []
                const chosen = (f.options || []).filter((o) => ids.includes(o.id))
                if (!chosen.length) return null
                return (
                  <div className="gcard-row" key={f.id}>
                    <span className="gc-label">{f.name}</span>
                    <span className="tags">
                      {chosen.map((o) => {
                        const c = OPTION_PALETTE[o.color % OPTION_PALETTE.length]
                        return <span className="tag" key={o.id} style={{ background: c.bg, color: c.text }}>{o.name}</span>
                      })}
                    </span>
                  </div>
                )
              }
              const dv = displayValue(f, val)
              if (!dv) return null
              return (
                <div className="gcard-row" key={f.id}>
                  <span className="gc-label">{f.name}</span>
                  <span className="gc-val">{f.type === 'checkbox' ? '✓' : dv}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <button className="gcard add" onClick={() => api.addRecord(table.id)}>+ New record</button>
    </div>
  )
}
