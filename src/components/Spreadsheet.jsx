import { useState } from 'react'
import { colLabel, makeCompute, isNumericStr } from '../formula'

export default function Spreadsheet({ sheet, selected, onSelect, onEdit }) {
  const [editing, setEditing] = useState(null)
  const compute = makeCompute(sheet.cells)
  const { rows, cols } = sheet

  function move(r, c) {
    const nr = Math.max(0, Math.min(rows - 1, r))
    const nc = Math.max(0, Math.min(cols - 1, c))
    const elm = document.getElementById(`cell-${nr}-${nc}`)
    if (elm) { elm.focus(); elm.select && elm.select() }
  }

  function onKey(e, r, c) {
    const input = e.currentTarget
    if (e.key === 'ArrowUp') { e.preventDefault(); move(r - 1, c) }
    else if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); move(r + 1, c) }
    else if (e.key === 'ArrowLeft' && input.selectionStart === 0) { e.preventDefault(); move(r, c - 1) }
    else if (e.key === 'ArrowRight' && input.selectionStart === input.value.length) { e.preventDefault(); move(r, c + 1) }
    else if (e.key === 'Tab') { e.preventDefault(); move(r, c + (e.shiftKey ? -1 : 1)) }
    else if (e.key === 'Escape') { input.blur() }
  }

  return (
    <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th className="corner" />
            {Array.from({ length: cols }).map((_, c) => (
              <th key={c} className={'colh' + (selected.c === c ? ' hl' : '')}>{colLabel(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              <th className={'rowh' + (selected.r === r ? ' hl' : '')}>{r + 1}</th>
              {Array.from({ length: cols }).map((_, c) => {
                const k = r + ',' + c
                const fmt = sheet.formats[k] || {}
                const raw = sheet.cells[k] ?? ''
                const disp = compute.display(r, c)
                const isSel = selected.r === r && selected.c === c
                const isEd = editing === k
                const style = {
                  fontWeight: fmt.b ? 700 : 400,
                  fontStyle: fmt.i ? 'italic' : 'normal',
                  textAlign: fmt.align || (isNumericStr(disp) ? 'right' : 'left'),
                  background: fmt.bg || undefined,
                }
                return (
                  <td key={c} className={'cell' + (isSel ? ' sel' : '')}>
                    <input
                      id={`cell-${r}-${c}`}
                      style={style}
                      value={isEd ? raw : disp}
                      spellCheck={false}
                      onFocus={() => { onSelect(r, c); setEditing(k) }}
                      onBlur={() => setEditing((e) => (e === k ? null : e))}
                      onChange={(e) => onEdit(r, c, e.target.value)}
                      onKeyDown={(e) => onKey(e, r, c)}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
