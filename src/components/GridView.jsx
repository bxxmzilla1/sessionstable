import { useState } from 'react'
import Cell from './Cell'
import FieldMenu from './FieldMenu'
import Icon from '../Icon'
import { FIELD_TYPE_MAP } from '../constants'

const isProxyField = (f) => f.type === 'text' && String(f.name || '').trim().toLowerCase() === 'proxy'

export default function GridView({ table, view, records, api, onExpand, onVpnSend }) {
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
                  <span className="fm-type-icon sm"><Icon name={FIELD_TYPE_MAP[f.type]?.icon} size={11} /></span>
                  <span className="fieldh-name">{f.name}</span>
                  <Icon name="chevronDown" size={12} className="caret" />
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
                <button className="expand" title="Expand record" onClick={() => onExpand(rec.id)}><Icon name="expand" size={12} /></button>
                {rec.launch?.token && (
                  <button
                    className="launch-link-btn"
                    title="Launch this container in Sessions 4"
                    onClick={() => { window.location.href = `sessions://open/${encodeURIComponent(rec.launch.token)}` }}
                  >
                    <Icon name="rocket" size={13} />
                  </button>
                )}
              </td>
              {visibleFields.map((f) => (
                <td key={f.id} className={'acell type-' + f.type}>
                  {isProxyField(f) && onVpnSend && String(rec.cells[f.id] || '').trim() ? (
                    <div className="proxy-cell">
                      <div className="proxy-cell-input">
                        <Cell
                          field={f}
                          value={rec.cells[f.id]}
                          onChange={(v) => api.updateCell(table.id, rec.id, f.id, v)}
                          onAddOption={(nm) => api.addSelectOption(table.id, f.id, nm)}
                        />
                      </div>
                      <button
                        className="proxy-vpn-btn"
                        title="Send this proxy to the VPN screen on your phone"
                        onClick={() => onVpnSend(rec.id)}
                      >
                        <Icon name="phone" size={13} />
                      </button>
                    </div>
                  ) : (
                    <Cell
                      field={f}
                      value={rec.cells[f.id]}
                      onChange={(v) => api.updateCell(table.id, rec.id, f.id, v)}
                      onAddOption={(nm) => api.addSelectOption(table.id, f.id, nm)}
                    />
                  )}
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
