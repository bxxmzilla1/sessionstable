import { useEffect, useRef, useState } from 'react'
import { FIELD_TYPES, OPTION_PALETTE, SELECT_TYPES } from '../constants'
import { uid } from '../base'

// Popover to create a new field or edit an existing one (name, type, select options).
export default function FieldMenu({ field, onSave, onDelete, onClose }) {
  const [name, setName] = useState(field?.name || '')
  const [type, setType] = useState(field?.type || 'text')
  const [options, setOptions] = useState(field?.options ? field.options.map((o) => ({ ...o })) : [])
  const ref = useRef(null)

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])

  const isSelect = SELECT_TYPES.includes(type)

  function addOption() {
    setOptions((o) => [...o, { id: uid('opt'), name: 'Option ' + (o.length + 1), color: o.length % OPTION_PALETTE.length }])
  }
  function updateOption(id, patch) {
    setOptions((o) => o.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }
  function removeOption(id) {
    setOptions((o) => o.filter((x) => x.id !== id))
  }

  function save() {
    const clean = name.trim() || 'Field'
    onSave({ name: clean, type, options: isSelect ? options : undefined })
    onClose()
  }

  return (
    <div className="field-menu" ref={ref}>
      <input className="fm-name" autoFocus placeholder="Field name" value={name}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />

      <div className="fm-label">Type</div>
      <div className="fm-types">
        {FIELD_TYPES.map((t) => (
          <button key={t.id} className={'fm-type' + (type === t.id ? ' on' : '')} onClick={() => setType(t.id)}>
            <span className="fm-type-icon">{t.icon}</span>{t.name}
          </button>
        ))}
      </div>

      {isSelect && (
        <div className="fm-options">
          <div className="fm-label">Options</div>
          {options.map((o) => (
            <div className="fm-option" key={o.id}>
              <div className="fm-colors">
                {OPTION_PALETTE.map((c, i) => (
                  <button key={i} className={'fm-color' + (o.color === i ? ' on' : '')}
                    style={{ background: c.bg }} onClick={() => updateOption(o.id, { color: i })} title={c.name} />
                ))}
              </div>
              <input className="fm-option-name" value={o.name} onChange={(e) => updateOption(o.id, { name: e.target.value })} />
              <button className="fm-option-x" onClick={() => removeOption(o.id)}>×</button>
            </div>
          ))}
          <button className="fm-add-option" onClick={addOption}>+ Add option</button>
        </div>
      )}

      <div className="fm-actions">
        {onDelete && <button className="btn danger sm" onClick={() => { onDelete(); onClose() }}>Delete field</button>}
        <div className="grow" />
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
        <button className="btn primary sm" onClick={save}>Save</button>
      </div>
    </div>
  )
}
