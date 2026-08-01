import { useEffect, useRef, useState } from 'react'
import { OPTION_PALETTE } from '../constants'

function Tag({ option, onRemove }) {
  const c = OPTION_PALETTE[option.color % OPTION_PALETTE.length]
  return (
    <span className="tag" style={{ background: c.bg, color: c.text }}>
      {option.name}
      {onRemove && (
        <button className="tag-x" onMouseDown={(e) => { e.preventDefault(); onRemove() }}>×</button>
      )}
    </span>
  )
}

function SelectPopover({ field, value, multi, onChange, onAddOption, onClose }) {
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])

  const options = field.options || []
  const selected = multi ? (Array.isArray(value) ? value : []) : value ? [value] : []
  const filtered = options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()))
  const exact = options.some((o) => o.name.toLowerCase() === q.trim().toLowerCase())

  function toggle(id) {
    if (multi) {
      const set = new Set(selected)
      set.has(id) ? set.delete(id) : set.add(id)
      onChange([...set])
    } else {
      onChange(selected[0] === id ? null : id)
      onClose()
    }
  }

  return (
    <div className="select-pop" ref={ref}>
      <input autoFocus className="select-search" placeholder="Find or create…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="select-list">
        {filtered.map((o) => (
          <button key={o.id} className="select-item" onClick={() => toggle(o.id)}>
            <Tag option={o} />
            {selected.includes(o.id) && <span className="check">✓</span>}
          </button>
        ))}
        {q.trim() && !exact && (
          <button className="select-item create" onClick={() => { const id = onAddOption(q.trim()); toggle(id); setQ('') }}>
            + Create <b>{q.trim()}</b>
          </button>
        )}
        {!filtered.length && !q.trim() && <div className="select-empty">No options yet</div>}
      </div>
    </div>
  )
}

export default function Cell({ field, value, onChange, onAddOption, expanded = false }) {
  const [selOpen, setSelOpen] = useState(false)

  switch (field.type) {
    case 'checkbox':
      return (
        <label className="cell-checkbox">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        </label>
      )

    case 'rating':
      return (
        <div className="cell-rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={'star' + (n <= (value || 0) ? ' on' : '')}
              onClick={() => onChange(n === value ? 0 : n)}
              title={n + ' / 5'}
            >★</button>
          ))}
        </div>
      )

    case 'date':
      return (
        <input
          className="cell-input" type="date"
          value={value || ''} onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'longText':
      return expanded ? (
        <textarea className="cell-textarea" rows={4} value={value || ''} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="cell-input" value={value || ''} onChange={(e) => onChange(e.target.value)} />
      )

    case 'singleSelect':
    case 'multiSelect': {
      const multi = field.type === 'multiSelect'
      const opts = field.options || []
      const ids = multi ? (Array.isArray(value) ? value : []) : value ? [value] : []
      const chosen = opts.filter((o) => ids.includes(o.id))
      return (
        <div className="cell-select">
          <button className="select-trigger" onClick={() => setSelOpen((s) => !s)}>
            {chosen.length ? (
              <span className="tags">{chosen.map((o) => <Tag key={o.id} option={o} />)}</span>
            ) : (
              <span className="placeholder">Select…</span>
            )}
            <span className="caret">▾</span>
          </button>
          {selOpen && (
            <SelectPopover
              field={field} value={value} multi={multi}
              onChange={onChange} onAddOption={onAddOption}
              onClose={() => setSelOpen(false)}
            />
          )}
        </div>
      )
    }

    case 'number':
      return (
        <input
          className="cell-input num" inputMode="decimal"
          value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'email':
    case 'url':
    case 'phone':
    case 'text':
    default:
      return (
        <input
          className="cell-input" type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
          value={value || ''} onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

export { Tag }
