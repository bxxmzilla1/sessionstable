import Cell from './Cell'
import Icon from '../Icon'
import { FIELD_TYPE_MAP } from '../constants'

// Full-screen record editor (Airtable's "expand record").
export default function RecordModal({ table, record, onCell, onAddOption, onDelete, onClose }) {
  const primary = record.cells[table.primaryFieldId]
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="record-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="rm-head">
          <div className="rm-title">{primary || 'Untitled record'}</div>
          <button className="icon-btn" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
        </div>
        <div className="rm-body">
          {table.fields.map((f) => (
            <div className="rm-field" key={f.id}>
              <div className="rm-field-label">
                <span className="fm-type-icon sm"><Icon name={FIELD_TYPE_MAP[f.type]?.icon} size={11} /></span>
                {f.name}
              </div>
              <div className="rm-field-value">
                <Cell
                  field={f}
                  value={record.cells[f.id]}
                  expanded
                  onChange={(v) => onCell(record.id, f.id, v)}
                  onAddOption={(nm) => onAddOption(f.id, nm)}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="rm-foot">
          <button className="btn danger sm" onClick={() => { onDelete(record.id); onClose() }}>Delete record</button>
          <div className="grow" />
          <button className="btn primary sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
