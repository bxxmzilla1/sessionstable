import { useEffect, useState } from 'react'
import Cell, { isTwoFactorField } from './Cell'
import FieldMenu from './FieldMenu'
import Icon from '../Icon'
import { FIELD_TYPE_MAP } from '../constants'
import { displayValue } from '../base'

const isProxyField = (f) => f.type === 'text' && String(f.name || '').trim().toLowerCase() === 'proxy'

// Plain-text columns use the spreadsheet model: click = select, double-click = edit.
// Rich cells (checkbox, selects, rating, date, 2FA) stay directly interactive.
const TEXTY = ['text', 'longText', 'number', 'email', 'url', 'phone']
const isTextyField = (f) => TEXTY.includes(f.type) && !isTwoFactorField(f)

const isFormEl = (el) =>
  !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)

export default function GridView({ table, view, records, api, clipboard, onVpnSend }) {
  const [fieldMenu, setFieldMenu] = useState(null) // fieldId | 'new'
  const [sel, setSel] = useState(null) // {kind:'row',recordId} | {kind:'cell',recordId,fieldId}
  const [editing, setEditing] = useState(null) // {recordId, fieldId}
  const visibleFields = table.fields.filter((f) => !view.hidden.includes(f.id))

  // Drop the selection if its record disappears (deleted, filtered away, sheet switched).
  useEffect(() => {
    if (sel && !records.some((r) => r.id === sel.recordId)) setSel(null)
  }, [records, sel])

  useEffect(() => {
    if (!sel || editing) return

    const onCopy = (e) => {
      if (isFormEl(document.activeElement)) return
      const rec = records.find((r) => r.id === sel.recordId)
      if (!rec) return
      e.preventDefault()
      if (sel.kind === 'cell') {
        const val = String(rec.cells[sel.fieldId] ?? '')
        e.clipboardData.setData('text/plain', val)
        clipboard.current = { kind: 'cell', value: val }
      } else {
        // Whole row: keyed by column name so it can be pasted into other tab sheets.
        const cells = {}
        for (const f of table.fields) {
          if (!isTextyField(f)) continue
          const v = rec.cells[f.id]
          if (v !== '' && v != null) cells[f.name] = String(v)
        }
        e.clipboardData.setData('text/plain', Object.values(cells).join('\t'))
        clipboard.current = { kind: 'row', cells }
      }
    }

    const onPaste = (e) => {
      if (isFormEl(document.activeElement)) return
      e.preventDefault()
      if (sel.kind === 'row') {
        if (clipboard.current?.kind === 'row') api.pasteRow(table.id, sel.recordId, clipboard.current.cells)
        return
      }
      const field = table.fields.find((f) => f.id === sel.fieldId)
      if (!field || !isTextyField(field)) return
      const text = e.clipboardData.getData('text/plain') ?? ''
      const lines = text.replace(/\r/g, '').split('\n')
      while (lines.length && lines[lines.length - 1] === '') lines.pop()
      if (!lines.length) return
      if (lines.length > 1) {
        api.pasteFillDown(table.id, sel.fieldId, sel.recordId, lines, records.map((r) => r.id))
      } else {
        api.updateCell(table.id, sel.recordId, sel.fieldId, lines[0])
      }
    }

    const onKey = (e) => {
      if (isFormEl(e.target)) return
      if (e.key === 'Escape') { setSel(null); return }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        if (sel.kind === 'row') { api.deleteRecord(table.id, sel.recordId); setSel(null) }
        else api.updateCell(table.id, sel.recordId, sel.fieldId, '')
        return
      }
      if (e.key === 'Enter' && sel.kind === 'cell') {
        const f = table.fields.find((x) => x.id === sel.fieldId)
        if (f && isTextyField(f)) { e.preventDefault(); setEditing({ recordId: sel.recordId, fieldId: sel.fieldId }) }
      }
    }

    document.addEventListener('copy', onCopy)
    document.addEventListener('paste', onPaste)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('keydown', onKey)
    }
  }, [sel, editing, records, table, api, clipboard])

  const renderTexty = (f, rec) => {
    const isEditing = editing && editing.recordId === rec.id && editing.fieldId === f.id
    if (isEditing) {
      return (
        <input
          className="cell-input"
          autoFocus
          type={f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : 'text'}
          defaultValue={rec.cells[f.id] ?? ''}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => { api.updateCell(table.id, rec.id, f.id, e.target.value); setEditing(null) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') {
              e.currentTarget.value = String(rec.cells[f.id] ?? '')
              e.currentTarget.blur()
            }
          }}
        />
      )
    }
    const selected = sel?.kind === 'cell' && sel.recordId === rec.id && sel.fieldId === f.id
    return (
      <div
        className={'gcell' + (selected ? ' gcell-sel' : '')}
        onClick={() => setSel({ kind: 'cell', recordId: rec.id, fieldId: f.id })}
        onDoubleClick={() => {
          setSel({ kind: 'cell', recordId: rec.id, fieldId: f.id })
          setEditing({ recordId: rec.id, fieldId: f.id })
        }}
      >
        {displayValue(f, rec.cells[f.id])}
      </div>
    )
  }

  const renderCell = (f, rec) => {
    if (isTextyField(f)) return renderTexty(f, rec)
    return (
      <div onClick={() => { if (sel) setSel(null) }}>
        <Cell
          field={f}
          value={rec.cells[f.id]}
          onChange={(v) => api.updateCell(table.id, rec.id, f.id, v)}
          onAddOption={(nm) => api.addSelectOption(table.id, f.id, nm)}
        />
      </div>
    )
  }

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
          {records.map((rec, i) => {
            const rowSel = sel?.kind === 'row' && sel.recordId === rec.id
            return (
              <tr key={rec.id} className={rowSel ? 'row-sel' : undefined}>
                <td
                  className="rownum selectable"
                  title="Select row"
                  onClick={() => setSel({ kind: 'row', recordId: rec.id })}
                >
                  <span className="rn">{i + 1}</span>
                  {rec.launch?.token && (
                    <button
                      className="launch-link-btn"
                      title="Launch this container in Sessions 4"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.location.href = `sessions://open/${encodeURIComponent(rec.launch.token)}`
                      }}
                    >
                      <Icon name="rocket" size={13} />
                    </button>
                  )}
                </td>
                {visibleFields.map((f) => (
                  <td key={f.id} className={'acell type-' + f.type}>
                    {isProxyField(f) && onVpnSend && String(rec.cells[f.id] || '').trim() ? (
                      <div className="proxy-cell">
                        <div className="proxy-cell-input">{renderCell(f, rec)}</div>
                        <button
                          className="proxy-vpn-btn"
                          title="Send this proxy to the VPN screen on your phone"
                          onClick={(e) => { e.stopPropagation(); onVpnSend(rec.id) }}
                        >
                          <Icon name="phone" size={13} />
                        </button>
                      </div>
                    ) : (
                      renderCell(f, rec)
                    )}
                  </td>
                ))}
                <td className="addfield" />
              </tr>
            )
          })}
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
