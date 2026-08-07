import { useEffect, useRef, useState } from 'react'
import { FIELD_TYPE_MAP, operatorsFor } from '../constants'
import { uid } from '../base'
import Icon from '../Icon'

export const VIEW_ICON = { grid: 'grid', kanban: 'kanban', gallery: 'gallery' }

function Popover({ children, onClose, className }) {
  const ref = useRef(null)
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])
  return <div className={'popover ' + (className || '')} ref={ref}>{children}</div>
}

export default function ViewBar({ table, view, api, search, onSearch, sidebarOpen, onToggleSidebar }) {
  const [open, setOpen] = useState(null) // 'sort' | 'filter' | 'hide' | 'group'
  const toggle = (k) => setOpen((o) => (o === k ? null : k))
  const close = () => setOpen(null)

  const fields = table.fields
  const activeCount = { filter: view.filters.length, hidden: view.hidden.length }

  return (
    <div className="viewbar">
      <div className="vb-left">
        <button className={'vb-toggle' + (sidebarOpen ? ' on' : '')} onClick={onToggleSidebar} title="Toggle views panel"><Icon name="menu" size={17} /></button>
        <span className="vb-viewname"><Icon name={VIEW_ICON[view.type]} size={14} className="vicon" />{view.name}</span>
      </div>

      <div className="vb-right">
        {view.type === 'kanban' && (
          <div className="vb-menu">
            <button className={'vb-btn' + (view.groupField ? ' active' : '')} onClick={() => toggle('group')}>Group</button>
            {open === 'group' && (
              <Popover onClose={close}>
                <div className="pop-label">Stack by</div>
                {fields.filter((f) => f.type === 'singleSelect').map((f) => (
                  <button key={f.id} className={'pop-item' + (view.groupField === f.id ? ' on' : '')}
                    onClick={() => { api.updateView(table.id, view.id, { groupField: f.id }); close() }}>{f.name}</button>
                ))}
                {!fields.some((f) => f.type === 'singleSelect') && <div className="pop-empty">No single-select fields</div>}
              </Popover>
            )}
          </div>
        )}

        <div className="vb-menu">
          <button className={'vb-btn' + (activeCount.hidden ? ' active' : '')} onClick={() => toggle('hide')}>
            Hide fields{activeCount.hidden ? ` (${activeCount.hidden})` : ''}
          </button>
          {open === 'hide' && (
            <Popover onClose={close}>
              {fields.map((f) => (
                <label key={f.id} className="pop-check">
                  <input type="checkbox" checked={!view.hidden.includes(f.id)} disabled={f.id === table.primaryFieldId}
                    onChange={(e) => {
                      const hidden = e.target.checked ? view.hidden.filter((x) => x !== f.id) : [...view.hidden, f.id]
                      api.updateView(table.id, view.id, { hidden })
                    }} />
                  <span className="fm-type-icon sm"><Icon name={FIELD_TYPE_MAP[f.type]?.icon} size={11} /></span>{f.name}
                </label>
              ))}
            </Popover>
          )}
        </div>

        <div className="vb-menu">
          <button className={'vb-btn' + (activeCount.filter ? ' active' : '')} onClick={() => toggle('filter')}>
            Filter{activeCount.filter ? ` (${activeCount.filter})` : ''}
          </button>
          {open === 'filter' && (
            <Popover onClose={close} className="filter-pop">
              {view.filters.length === 0 && <div className="pop-empty">No filters yet</div>}
              {view.filters.map((flt) => {
                const f = fields.find((x) => x.id === flt.field) || fields[0]
                const ops = operatorsFor(f.type)
                const noValue = ['empty', 'notEmpty', 'checked', 'unchecked'].includes(flt.op)
                return (
                  <div className="filter-row" key={flt.id}>
                    <select value={flt.field} onChange={(e) => api.updateFilter(table.id, view.id, flt.id, { field: e.target.value, op: operatorsFor(fields.find((x) => x.id === e.target.value).type)[0].id })}>
                      {fields.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <select value={flt.op} onChange={(e) => api.updateFilter(table.id, view.id, flt.id, { op: e.target.value })}>
                      {ops.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    {!noValue && (
                      <input className="filter-val" value={flt.value || ''} placeholder="value"
                        onChange={(e) => api.updateFilter(table.id, view.id, flt.id, { value: e.target.value })} />
                    )}
                    <button className="filter-x" onClick={() => api.removeFilter(table.id, view.id, flt.id)}><Icon name="close" size={14} /></button>
                  </div>
                )
              })}
              <button className="pop-add" onClick={() => api.addFilter(table.id, view.id, { id: uid('flt'), field: fields[0].id, op: operatorsFor(fields[0].type)[0].id, value: '' })}>+ Add filter</button>
            </Popover>
          )}
        </div>

        <div className="vb-menu">
          <button className={'vb-btn' + (view.sort ? ' active' : '')} onClick={() => toggle('sort')}>
            Sort{view.sort ? ' (1)' : ''}
          </button>
          {open === 'sort' && (
            <Popover onClose={close}>
              <div className="pop-label">Sort by</div>
              <button className={'pop-item' + (!view.sort ? ' on' : '')} onClick={() => { api.updateView(table.id, view.id, { sort: null }); close() }}>None</button>
              {fields.map((f) => (
                <button key={f.id} className={'pop-item' + (view.sort?.field === f.id ? ' on' : '')}
                  onClick={() => api.updateView(table.id, view.id, { sort: { field: f.id, dir: view.sort?.field === f.id && view.sort.dir === 'asc' ? 'desc' : 'asc' } })}>
                  {f.name}{view.sort?.field === f.id ? (view.sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </Popover>
          )}
        </div>

        <input className="vb-search" placeholder="Search…" value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
    </div>
  )
}
