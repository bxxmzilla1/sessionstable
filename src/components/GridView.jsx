import { Fragment, useEffect, useState } from 'react'
import Cell, { isTwoFactorField } from './Cell'
import FieldMenu from './FieldMenu'
import Icon from '../Icon'
import { FIELD_TYPE_MAP, optionColor } from '../constants'
import { displayValue, emptyValueFor, TEXT_FIELD_TYPES } from '../base'

const isProxyField = (f) => f.type === 'text' && String(f.name || '').trim().toLowerCase() === 'proxy'

// Plain-text columns use the spreadsheet model: click = select, double-click = edit.
// Rich cells (checkbox, selects, rating, date, 2FA) stay directly interactive.
const isTextyField = (f) => TEXT_FIELD_TYPES.includes(f.type) && !isTwoFactorField(f)

const isFormEl = (el) =>
  !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)

const keyOf = (recordId, fieldId) => recordId + '|' + fieldId

export default function GridView({ table, view, records, api, clipboard, onVpnSend }) {
  const [fieldMenu, setFieldMenu] = useState(null) // fieldId | 'new'
  // sel: { kind:'row', ids:[recordId], anchor:recordId }
  //    | { kind:'cell', keys:['rid|fid'], anchor:{recordId,fieldId} }
  const [sel, setSel] = useState(null)
  const [editing, setEditing] = useState(null) // {recordId, fieldId}
  const [dragW, setDragW] = useState(null) // live column-resize preview: { fieldId, width }
  const visibleFields = table.fields.filter((f) => !view.hidden.includes(f.id))

  // ── Collapsible groups (Airtable "group by") ──
  // When the view has a groupField, rows are bucketed by that column's value and each
  // bucket renders under a clickable header that expands/collapses it. Collapsed keys
  // are remembered per view in localStorage (a device preference, not sheet data).
  const groupField = view.groupField ? table.fields.find((f) => f.id === view.groupField) : null
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('st_grp_' + view.id) || '[]')) } catch (e) { return new Set() }
  })
  useEffect(() => {
    try { setCollapsed(new Set(JSON.parse(localStorage.getItem('st_grp_' + view.id) || '[]'))) } catch (e) { setCollapsed(new Set()) }
  }, [view.id])
  const toggleGroup = (key) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { localStorage.setItem('st_grp_' + view.id, JSON.stringify([...next])) } catch (e) {}
      return next
    })
  }

  // groups: [{ key, label, chip: {bg,text}|null, sample, records }] — null when not grouping.
  const groups = (() => {
    if (!groupField) return null
    const map = new Map()
    for (const rec of records) {
      const v = rec.cells[groupField.id]
      let key, label, chip = null, sample = v
      if (groupField.type === 'singleSelect') {
        const opt = (groupField.options || []).find((o) => o.id === v)
        key = opt ? opt.id : ''
        label = opt ? opt.name : 'Empty'
        if (opt) chip = optionColor(opt)
        sample = opt ? opt.id : ''
      } else {
        const dv = displayValue(groupField, v).trim()
        key = dv.toLowerCase()
        label = dv || 'Empty'
      }
      if (!map.has(key)) map.set(key, { key, label, chip, sample, records: [] })
      map.get(key).records.push(rec)
    }
    let list = [...map.values()]
    if (groupField.type === 'singleSelect') {
      const pos = new Map((groupField.options || []).map((o, i) => [o.id, i]))
      list.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : (pos.get(a.key) ?? 0) - (pos.get(b.key) ?? 0)))
    } else {
      list.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.label.localeCompare(b.label)))
    }
    return list
  })()

  // Visible order for everything index-based (row numbers, shift ranges, paste-down):
  // grouped order when grouping, otherwise the processed records as-is.
  const orderedRecords = groups ? groups.flatMap((g) => g.records) : records

  // New row inside a group: pre-fill the grouping column so it lands in that bucket.
  const addToGroup = (g) => {
    const preset = {}
    if (g.sample !== '' && g.sample != null) preset[groupField.id] = g.sample
    api.addRecord(table.id, preset)
  }

  const widthOf = (f) => (dragW?.fieldId === f.id ? dragW.width : f.width)
  const colStyle = (f) => {
    const w = widthOf(f)
    return w ? { width: w, minWidth: w, maxWidth: w } : undefined
  }

  // Drag the right edge of a header to resize its column; the final width is saved
  // on the field itself, so it autosaves with the sheet and follows the account.
  const startResize = (e, f) => {
    e.preventDefault()
    e.stopPropagation()
    const th = e.currentTarget.closest('th')
    const startX = e.clientX
    const startW = f.width || (th ? Math.round(th.getBoundingClientRect().width) : 180)
    let w = startW
    const move = (ev) => {
      w = Math.max(70, Math.min(900, Math.round(startW + ev.clientX - startX)))
      setDragW({ fieldId: f.id, width: w })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setDragW(null)
      if (w !== f.width) api.updateField(table.id, f.id, { width: w })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const rowIndex = (rid) => orderedRecords.findIndex((r) => r.id === rid)
  const colIndex = (fid) => visibleFields.findIndex((f) => f.id === fid)

  // Drop selected records that disappeared (deleted, filtered away, sheet switched).
  useEffect(() => {
    if (!sel) return
    if (sel.kind === 'row') {
      const ids = sel.ids.filter((id) => rowIndex(id) >= 0)
      if (ids.length !== sel.ids.length) setSel(ids.length ? { ...sel, ids } : null)
    } else {
      const keys = sel.keys.filter((k) => rowIndex(k.split('|')[0]) >= 0)
      if (keys.length !== sel.keys.length) setSel(keys.length ? { ...sel, keys } : null)
    }
  }, [records, sel]) // eslint-disable-line react-hooks/exhaustive-deps

  const clickRow = (e, recId) => {
    if (e.shiftKey && sel?.kind === 'row' && sel.anchor) {
      const a = rowIndex(sel.anchor)
      const b = rowIndex(recId)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a <= b ? [a, b] : [b, a]
        setSel({ kind: 'row', ids: orderedRecords.slice(lo, hi + 1).map((r) => r.id), anchor: sel.anchor })
        return
      }
    }
    if ((e.ctrlKey || e.metaKey) && sel?.kind === 'row') {
      const ids = sel.ids.includes(recId) ? sel.ids.filter((x) => x !== recId) : [...sel.ids, recId]
      setSel(ids.length ? { kind: 'row', ids, anchor: recId } : null)
      return
    }
    setSel({ kind: 'row', ids: [recId], anchor: recId })
  }

  const clickCell = (e, recId, fieldId) => {
    if (e.shiftKey && sel?.kind === 'cell' && sel.anchor) {
      const r1 = rowIndex(sel.anchor.recordId)
      const r2 = rowIndex(recId)
      const c1 = colIndex(sel.anchor.fieldId)
      const c2 = colIndex(fieldId)
      if (r1 >= 0 && r2 >= 0 && c1 >= 0 && c2 >= 0) {
        // Rectangular range: every cell between the anchor and the clicked cell,
        // in both directions (up/down and left/right).
        const keys = []
        for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
          for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
            keys.push(keyOf(orderedRecords[r].id, visibleFields[c].id))
          }
        }
        setSel({ kind: 'cell', keys, anchor: sel.anchor })
        return
      }
    }
    if ((e.ctrlKey || e.metaKey) && sel?.kind === 'cell') {
      const k = keyOf(recId, fieldId)
      const keys = sel.keys.includes(k) ? sel.keys.filter((x) => x !== k) : [...sel.keys, k]
      setSel(keys.length ? { kind: 'cell', keys, anchor: { recordId: recId, fieldId } } : null)
      return
    }
    setSel({ kind: 'cell', keys: [keyOf(recId, fieldId)], anchor: { recordId: recId, fieldId } })
  }

  // Selected cells grouped by row, in visible order — used for copy and top-left lookup.
  const selectedCellMatrix = () => {
    if (sel?.kind !== 'cell') return []
    const rows = new Map() // rowIdx -> [{colIdx, recordId, fieldId}]
    for (const k of sel.keys) {
      const [rid, fid] = k.split('|')
      const r = rowIndex(rid)
      const c = colIndex(fid)
      if (r < 0 || c < 0) continue
      if (!rows.has(r)) rows.set(r, [])
      rows.get(r).push({ colIdx: c, recordId: rid, fieldId: fid })
    }
    return [...rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([r, cells]) => ({ rowIdx: r, cells: cells.sort((a, b) => a.colIdx - b.colIdx) }))
  }

  useEffect(() => {
    if (!sel || editing) return

    const onCopy = (e) => {
      if (isFormEl(document.activeElement)) return
      e.preventDefault()
      if (sel.kind === 'row') {
        const chosen = orderedRecords.filter((r) => sel.ids.includes(r.id))
        // In-app clipboard keyed by column name so rows can be pasted into other tab sheets.
        const rows = chosen.map((rec) => {
          const cells = {}
          for (const f of table.fields) {
            if (!isTextyField(f)) continue
            const v = rec.cells[f.id]
            if (v !== '' && v != null) cells[f.name] = String(v)
          }
          return cells
        })
        clipboard.current = { kind: 'rows', rows }
        const tsv = chosen
          .map((rec) => visibleFields.map((f) => displayValue(f, rec.cells[f.id])).join('\t'))
          .join('\n')
        e.clipboardData.setData('text/plain', tsv)
      } else {
        const matrix = selectedCellMatrix()
        const recById = new Map(records.map((r) => [r.id, r]))
        const tsv = matrix
          .map(({ cells }) => cells.map(({ recordId, fieldId, colIdx }) => {
            const rec = recById.get(recordId)
            return displayValue(visibleFields[colIdx], rec ? rec.cells[fieldId] : '')
          }).join('\t'))
          .join('\n')
        clipboard.current = { kind: 'cells', text: tsv }
        e.clipboardData.setData('text/plain', tsv)
      }
    }

    const onPaste = (e) => {
      if (isFormEl(document.activeElement)) return
      e.preventDefault()
      const orderedIds = orderedRecords.map((r) => r.id)
      if (sel.kind === 'row') {
        if (clipboard.current?.kind === 'rows' && clipboard.current.rows?.length) {
          // Start at the topmost selected row; overwrite downward, append leftovers.
          const top = [...sel.ids].sort((a, b) => rowIndex(a) - rowIndex(b))[0]
          api.pasteRows(table.id, top, clipboard.current.rows, orderedIds)
        }
        return
      }
      const text = e.clipboardData.getData('text/plain') ?? ''
      const lines = text.replace(/\r/g, '').split('\n')
      while (lines.length && lines[lines.length - 1] === '') lines.pop()
      if (!lines.length) return
      const grid = lines.map((l) => l.split('\t'))
      const single = grid.length === 1 && grid[0].length === 1
      if (single && sel.keys.length > 1) {
        // One value, many selected cells: fill them all (text columns only).
        const fieldById = new Map(table.fields.map((f) => [f.id, f]))
        const entries = sel.keys
          .map((k) => { const [recordId, fieldId] = k.split('|'); return { recordId, fieldId } })
          .filter(({ fieldId }) => { const f = fieldById.get(fieldId); return f && isTextyField(f) })
          .map((c) => ({ ...c, value: grid[0][0] }))
        api.setCellsBulk(table.id, entries)
        return
      }
      // Paste the block starting at the top-left selected cell.
      const matrix = selectedCellMatrix()
      const start = matrix[0]?.cells[0]
      if (!start) return
      if (single) {
        api.updateCell(table.id, start.recordId, start.fieldId, grid[0][0])
      } else {
        api.pasteGrid(table.id, start.recordId, start.fieldId, grid, orderedIds, visibleFields.map((f) => f.id))
      }
    }

    const onKey = (e) => {
      if (isFormEl(e.target)) return
      if (e.key === 'Escape') { setSel(null); return }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        if (sel.kind === 'row') {
          api.deleteRecords(table.id, sel.ids)
          setSel(null)
        } else {
          const fieldById = new Map(table.fields.map((f) => [f.id, f]))
          const entries = sel.keys.map((k) => {
            const [recordId, fieldId] = k.split('|')
            const f = fieldById.get(fieldId)
            return f ? { recordId, fieldId, value: emptyValueFor(f.type) } : null
          }).filter(Boolean)
          api.setCellsBulk(table.id, entries)
        }
        return
      }
      if (e.key === 'Enter' && sel.kind === 'cell' && sel.keys.length === 1) {
        const [recordId, fieldId] = sel.keys[0].split('|')
        const f = table.fields.find((x) => x.id === fieldId)
        if (f && isTextyField(f)) { e.preventDefault(); setEditing({ recordId, fieldId }) }
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
  }, [sel, editing, records, view, table, api, clipboard]) // eslint-disable-line react-hooks/exhaustive-deps

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
    return (
      <div
        className="gcell"
        onClick={(e) => clickCell(e, rec.id, f.id)}
        onDoubleClick={() => {
          setSel({ kind: 'cell', keys: [keyOf(rec.id, f.id)], anchor: { recordId: rec.id, fieldId: f.id } })
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

  const cellSelected = (rid, fid) => sel?.kind === 'cell' && sel.keys.includes(keyOf(rid, fid))

  const renderDataRow = (rec, num) => {
    const rowSel = sel?.kind === 'row' && sel.ids.includes(rec.id)
    return (
      <tr key={rec.id} className={rowSel ? 'row-sel' : undefined}>
        <td
          className="rownum selectable"
          title="Select row (Ctrl+click to multi-select, Shift+click for a range)"
          onClick={(e) => clickRow(e, rec.id)}
        >
          <span className="rn">{num}</span>
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
          <td key={f.id} className={'acell type-' + f.type + (cellSelected(rec.id, f.id) ? ' acell-sel' : '')}>
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
  }

  return (
    <div className="grid-view">
      <table className="atable">
        <thead>
          <tr>
            <th className="rownum">#</th>
            {visibleFields.map((f) => (
              <th key={f.id} className="fieldh" style={colStyle(f)}>
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
                <span className="col-resize" title="Drag to resize" onMouseDown={(e) => startResize(e, f)} />
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
          {groups ? (
            groups.map((g) => {
              const isOpen = !collapsed.has(g.key)
              return (
                <Fragment key={g.key || '__empty__'}>
                  <tr className="grp-row" onClick={() => toggleGroup(g.key)} title={isOpen ? 'Collapse group' : 'Expand group'}>
                    <td colSpan={visibleFields.length + 2} className="grp-cell">
                      <span className="grp-inner">
                        <span className={'grp-chevron' + (isOpen ? ' open' : '')}><Icon name="chevronDown" size={14} /></span>
                        <span className="grp-field">{groupField.name}</span>
                        {g.chip ? (
                          <span className="tag grp-tag" style={{ background: g.chip.bg, color: g.chip.text }}>{g.label}</span>
                        ) : (
                          <span className="grp-label">{g.label}</span>
                        )}
                        <span className="grp-count">{g.records.length}</span>
                      </span>
                    </td>
                  </tr>
                  {isOpen && g.records.map((rec, i) => renderDataRow(rec, i + 1))}
                  {isOpen && (
                    <tr className="addrow grp-addrow">
                      <td className="rownum">
                        <button className="addrow-btn" onClick={() => addToGroup(g)} title="Add record to this group">+</button>
                      </td>
                      <td colSpan={visibleFields.length + 1} className="addrow-cell">
                        <button className="addrow-text" onClick={() => addToGroup(g)}>+</button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          ) : (
            records.map((rec, i) => renderDataRow(rec, i + 1))
          )}
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
