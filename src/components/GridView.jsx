import { useState } from 'react'
import Cell from './Cell'
import FieldMenu from './FieldMenu'
import { FIELD_TYPE_MAP } from '../constants'

export default function GridView({ table, view, records, api, onExpand }) {
  const [fieldMenu, setFieldMenu] = useState(null) // fieldId | 'new'
  const visibleFields = table.fields.filter((f) => !view.hidden.includes(f.id))

  return (
    <div className="grid-view">
      <table className="atable">
        <thead>
          <tr>
            <th className="rownum">#</th>
            {visibleFields.map((f) => (
              <th key={f.id} className="fieldh">
                <button className="fieldh-btn" onClick={() => setFieldMenu(f.id)}>
                  <span className="fm-type-icon sm">{FIELD_TYPE_MAP[f.type]?.icon}</span>
                  <span className="fieldh-name">{f.name}</span>
                  <span className="caret">▾</span>
                </button>
                {fieldMenu === f.id && (
                  <FieldMenu
                    field={f}
                    onSave={(patch) => api.updateField(table.id, f.id, patch)}
                    onDelete={table.fields.length > 1 ? () => api.deleteField(table.id, f.id) : null}
                    onClose={() => setFieldMenu(null)}
                  />
                )}
              </th>
            ))}
            <th className="addfield">
              <button className="addfield-btn" onClick={() => setFieldMenu('new')} title="Add field">+</button>
              {fieldMenu === 'new' && (
                <FieldMenu
                  onSave={(patch) => api.addField(table.id, patch)}
                  onClose={() => setFieldMenu(null)}
                />
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec, i) => (
            <tr key={rec.id}>
              <td className="rownum">
                <span className="rn">{i + 1}</span>
                <button className="expand" title="Expand record" onClick={() => onExpand(rec.id)}>⤢</button>
                {rec.launch?.token && (
                  <button
                    className="launch-link-btn"
                    title="Launch this container in Sessions 4"
                    onClick={() => { window.location.href = `sessions://open/${encodeURIComponent(rec.launch.token)}` }}
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                    </svg>
                  </button>
                )}
              </td>
              {visibleFields.map((f) => (
                <td key={f.id} className={'acell type-' + f.type}>
                  <Cell
                    field={f}
                    value={rec.cells[f.id]}
                    onChange={(v) => api.updateCell(table.id, rec.id, f.id, v)}
                    onAddOption={(nm) => api.addSelectOption(table.id, f.id, nm)}
                  />
                </td>
              ))}
              <td className="addfield" />
            </tr>
          ))}
          <tr className="addrow">
            <td className="rownum">
              <button className="addrow-btn" onClick={() => api.addRecord(table.id)} title="Add record">+</button>
            </td>
            <td colSpan={visibleFields.length + 1} className="addrow-cell">
              <button className="addrow-text" onClick={() => api.addRecord(table.id)}>+ New record</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
