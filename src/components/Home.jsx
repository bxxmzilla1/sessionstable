import { useState } from 'react'
import { WORKSPACE_COLORS, formatOpened } from '../base'
import Icon from '../Icon'

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'WS'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export default function Home({ store, onOpen, onCreate, onRename, onDelete, onSettings }) {
  const [editing, setEditing] = useState(null)
  const [menu, setMenu] = useState(null)
  // On phones the sidebar is a slide-in drawer; on desktop it's always visible.
  const [sideOpen, setSideOpen] = useState(false)

  const sorted = [...store.workspaces].sort((a, b) => {
    const at = new Date(a.openedAt || 0).getTime()
    const bt = new Date(b.openedAt || 0).getTime()
    return bt - at
  })

  return (
    <div className="home">
      {sideOpen && <div className="home-scrim" onClick={() => setSideOpen(false)} />}
      <aside className={'home-side' + (sideOpen ? ' open' : '')}>
        <div className="hs-brand"><span className="logo"><Icon name="table" size={16} /></span> Sessions Table</div>
        <button className="hs-nav on"><Icon name="home" size={16} /> Home</button>
        <button className="hs-nav" onClick={() => { setSideOpen(false); onSettings() }}><Icon name="settings" size={16} /> Settings</button>
        <div className="hs-section">
          <div className="hs-section-head">
            <span>Workspaces</span>
            <button className="hs-plus" title="Create workspace" onClick={onCreate}>+</button>
          </div>
          <div className="hs-ws-list">
            {sorted.map((w) => {
              const c = WORKSPACE_COLORS[w.color % WORKSPACE_COLORS.length]
              return (
                <button key={w.id} className="hs-ws-item" onClick={() => onOpen(w.id)}>
                  <span className="hs-dot" style={{ background: c.accent }} />
                  <span className="hs-ws-name">{w.name}</span>
                </button>
              )
            })}
          </div>
        </div>
        <button className="hs-create" onClick={onCreate}>+ Create workspace</button>
      </aside>

      <main className="home-main">
        <div className="home-head">
          <button className="home-menu-btn" onClick={() => setSideOpen(true)} title="Menu"><Icon name="menu" size={17} /></button>
          <h1>Home</h1>
          <button className="btn primary sm" onClick={onCreate}>+ Create</button>
        </div>
        <p className="home-sub">Open a workspace to see its tables, views, and records.</p>

        {!sorted.length && (
          <div className="home-empty">
            <p>No workspaces yet.</p>
            <button className="btn primary" onClick={onCreate}>Create your first workspace</button>
          </div>
        )}

        <div className="ws-grid">
          {sorted.map((w) => {
            const c = WORKSPACE_COLORS[w.color % WORKSPACE_COLORS.length]
            const tableCount = (w.tables || []).length
            return (
              <div key={w.id} className="ws-card" onClick={() => onOpen(w.id)}>
                <div className="ws-card-top">
                  <div className="ws-icon" style={{ background: c.bg, color: c.accent }}>{initials(w.name)}</div>
                  <div className="ws-menu-wrap" onClick={(e) => e.stopPropagation()}>
                    <button className="ws-menu-btn" onClick={() => setMenu(menu === w.id ? null : w.id)}><Icon name="more" size={18} /></button>
                    {menu === w.id && (
                      <div className="ws-menu">
                        <button onClick={() => { setEditing(w.id); setMenu(null) }}>Rename</button>
                        <button className="danger" onClick={() => { onDelete(w.id); setMenu(null) }}>Delete</button>
                      </div>
                    )}
                  </div>
                </div>
                {editing === w.id ? (
                  <input
                    autoFocus
                    className="ws-rename"
                    defaultValue={w.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => { onRename(w.id, e.target.value); setEditing(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  />
                ) : (
                  <div className="ws-title">{w.name}</div>
                )}
                <div className="ws-meta">
                  {tableCount} table{tableCount === 1 ? '' : 's'} · {formatOpened(w.openedAt)}
                </div>
              </div>
            )
          })}

          <button className="ws-card add" onClick={onCreate}>
            <span className="ws-add-plus">+</span>
            <span>New workspace</span>
          </button>
        </div>
      </main>
    </div>
  )
}
