import { colLabel } from '../formula'

const SWATCHES = ['', '#ede9fe', '#dcfce7', '#fef9c3', '#fee2e2', '#dbeafe', '#fce7f3']

export default function Toolbar({
  title, onTitle, format, onFormat, onAddRow, onAddCol, selected, cellRaw, onFormula,
}) {
  const ref = colLabel(selected.c) + (selected.r + 1)
  const toggle = (k) => onFormat({ [k]: !format[k] })

  return (
    <div className="toolbar">
      <div className="trow">
        <input className="title" value={title} onChange={(e) => onTitle(e.target.value)} aria-label="Sheet title" />
        <div className="grow" />
        <button className="tbtn" onClick={onAddRow}>+ Row</button>
        <button className="tbtn" onClick={onAddCol}>+ Column</button>
      </div>

      <div className="trow tools">
        <span className="cellref">{ref}</span>
        <button className={'fbtn' + (format.b ? ' on' : '')} onClick={() => toggle('b')} title="Bold"><b>B</b></button>
        <button className={'fbtn' + (format.i ? ' on' : '')} onClick={() => toggle('i')} title="Italic"><i>I</i></button>
        <span className="divider" />
        <button className={'fbtn' + (format.align === 'left' ? ' on' : '')} onClick={() => onFormat({ align: 'left' })} title="Align left">⭰</button>
        <button className={'fbtn' + (format.align === 'center' ? ' on' : '')} onClick={() => onFormat({ align: 'center' })} title="Align center">≡</button>
        <button className={'fbtn' + (format.align === 'right' ? ' on' : '')} onClick={() => onFormat({ align: 'right' })} title="Align right">⭲</button>
        <span className="divider" />
        <div className="swatches">
          {SWATCHES.map((c, i) => (
            <button
              key={i}
              className={'swatch' + ((format.bg || '') === c ? ' on' : '')}
              style={{ background: c || '#ffffff' }}
              onClick={() => onFormat({ bg: c })}
              title={c ? 'Fill ' + c : 'No fill'}
            >
              {c ? '' : '⃠'}
            </button>
          ))}
        </div>
      </div>

      <div className="trow formula">
        <span className="fx">fx</span>
        <input
          value={cellRaw}
          onChange={(e) => onFormula(e.target.value)}
          placeholder="Value, or a formula like =SUM(A1:A5)"
          aria-label="Formula bar"
        />
      </div>
    </div>
  )
}
