import { useEffect, useRef, useState } from 'react'
import { optionColor } from '../constants'
import { totp, isValidSecret, secondsRemaining, TOTP_STEP } from '../totp'
import Icon from '../Icon'

// A "2FA" column: the cell holds the base32 secret, and a button on the right transforms it into
// the live 6-digit code with a countdown ring showing when it rolls over. Clicking the code (or the
// button while revealed) copies it. It re-computes every second and refreshes on each 30s boundary.
export function isTwoFactorField(field) {
  return String(field?.name || '').trim().toLowerCase() === '2fa'
}

function TotpCell({ value, onChange }) {
  const [reveal, setReveal] = useState(false)
  const [code, setCode] = useState('')
  const [remaining, setRemaining] = useState(TOTP_STEP)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef(null)
  const valid = isValidSecret(value)

  useEffect(() => {
    if (!reveal || !valid) return
    let alive = true
    const tick = async () => {
      const c = await totp(value)
      if (!alive) return
      setCode(c)
      setRemaining(secondsRemaining())
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => { alive = false; clearInterval(id) }
  }, [reveal, valid, value])

  // A stale secret (edited to something invalid) can't stay revealed.
  useEffect(() => { if (reveal && !valid) setReveal(false) }, [reveal, valid])
  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  // Copy to clipboard and flash a brief "Copied" confirmation so the click is obviously working.
  const copy = async (text) => {
    if (!text) return
    try {
      await navigator.clipboard?.writeText(text)
      setCopied(true)
      clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 1100)
    } catch { /* clipboard blocked — nothing to do */ }
  }

  async function onBtn() {
    if (!valid) return
    if (reveal) { setReveal(false); return }
    const c = await totp(value)
    setCode(c)
    setRemaining(secondsRemaining())
    setReveal(true)
    copy(c)
  }

  const pct = Math.round((remaining / TOTP_STEP) * 100)
  const ring = { background: `conic-gradient(var(--accent) ${pct}%, var(--border2) 0)` }

  return (
    <div className="cell-2fa">
      {reveal && valid ? (
        <button
          type="button"
          className={'totp-code' + (copied ? ' copied' : '')}
          title="Click to copy code"
          onClick={() => copy(code)}
        >
          <span className="totp-digits">{code}</span>
          <span className="totp-copied">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      ) : (
        <input
          className="cell-input" value={value || ''} placeholder="2FA secret key"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <button
        type="button"
        className={'totp-btn' + (reveal ? ' on' : '')}
        onClick={onBtn}
        disabled={!valid}
        title={valid ? (reveal ? `Rotates in ${remaining}s — click to hide` : 'Show 2FA code') : 'Enter a valid 2FA secret key'}
      >
        {reveal ? (
          <span className="totp-ring" style={ring}><span className="totp-secs">{remaining}</span></span>
        ) : '🔑'}
      </button>
    </div>
  )
}

function Tag({ option, onRemove }) {
  const c = optionColor(option)
  return (
    <span className="tag" style={{ background: c.bg, color: c.text }}>
      {option.name}
      {onRemove && (
        <button className="tag-x" onMouseDown={(e) => { e.preventDefault(); onRemove() }}><Icon name="close" size={12} /></button>
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
            {selected.includes(o.id) && <span className="check"><Icon name="check" size={13} /></span>}
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

  // A text-like column named "2FA" becomes a live authenticator cell regardless of its exact type.
  if (isTwoFactorField(field) && ['text', 'longText', 'email', 'url', 'phone'].includes(field.type)) {
    return <TotpCell value={value} onChange={onChange} />
  }

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
            ><Icon name="rating" size={15} fill={n <= (value || 0)} /></button>
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
