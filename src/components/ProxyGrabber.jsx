import { useEffect, useMemo, useState } from 'react'
import Icon from '../Icon'
import { cleanProxyLines } from '../base'

// Account-level "Proxy Grabber": named pools of proxy links. Sessions 4 grabs a proxy from the
// selected list when creating a container, and removes it from the list once that container is
// saved with XSave. Everything here writes into the shared account document.
export default function ProxyGrabber({ lists = [], onCreate, onRename, onDelete, onSetProxies }) {
  const [selectedId, setSelectedId] = useState(lists[0]?.id || null)
  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState(false)

  const selected = useMemo(() => lists.find((l) => l.id === selectedId) || null, [lists, selectedId])

  // Keep a valid selection as lists change (create/delete/live-sync).
  useEffect(() => {
    if (!lists.some((l) => l.id === selectedId)) setSelectedId(lists[0]?.id || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists.length])

  // Load the selected list's proxies into the editable textarea.
  useEffect(() => {
    setDraft((selected?.proxies || []).join('\n'))
    setRenaming(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  function saveDraft() {
    if (!selected) return
    onSetProxies(selected.id, cleanProxyLines(draft))
  }

  function createList() {
    const name = (prompt('Name this proxy list', 'Proxy list') || '').trim()
    if (!name) return
    const id = onCreate(name)
    if (id) setSelectedId(id)
  }

  const count = cleanProxyLines(draft).length

  return (
    <div className="pg">
      <div className="pg-inner">
        <div className="pg-head">
          <div className="pg-badge"><Icon name="vpn" size={22} /></div>
          <div>
            <h1>Proxy Grabber</h1>
            <p className="pg-sub">Create named lists of proxy links. Sessions 4 grabs one per new container.</p>
          </div>
        </div>

        <div className="pg-body">
          <aside className="pg-lists">
            <div className="pg-lists-head">
              <span>Lists</span>
              <button className="pg-plus" title="New list" onClick={createList}>+</button>
            </div>
            {lists.length ? (
              lists.map((l) => (
                <button
                  key={l.id}
                  className={'pg-list-item' + (l.id === selectedId ? ' on' : '')}
                  onClick={() => setSelectedId(l.id)}
                >
                  <span className="pg-list-name">{l.name}</span>
                  <span className="pg-list-count">{(l.proxies || []).length}</span>
                </button>
              ))
            ) : (
              <div className="pg-empty-lists">No lists yet.</div>
            )}
            <button className="pg-create" onClick={createList}>+ New proxy list</button>
          </aside>

          <section className="pg-editor">
            {selected ? (
              <>
                <div className="pg-editor-head">
                  {renaming ? (
                    <input
                      className="pg-rename"
                      autoFocus
                      defaultValue={selected.name}
                      onBlur={(e) => { onRename(selected.id, e.target.value); setRenaming(false) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    />
                  ) : (
                    <h2 className="pg-editor-name" onClick={() => setRenaming(true)} title="Click to rename">
                      {selected.name}
                    </h2>
                  )}
                  <div className="pg-editor-actions">
                    <button className="pg-btn" onClick={() => setRenaming(true)}>Rename</button>
                    <button className="pg-btn danger" onClick={() => onDelete(selected.id)}>Delete</button>
                  </div>
                </div>
                <label className="pg-label">Proxy links — one per line</label>
                <textarea
                  className="pg-textarea"
                  value={draft}
                  spellCheck={false}
                  placeholder={'host:port:user:pass\nsocks5://user:pass@host:port\nhost:port'}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={saveDraft}
                />
                <div className="pg-editor-foot">
                  <span className="pg-count">{count} prox{count === 1 ? 'y' : 'ies'}</span>
                  <button className="pg-save" onClick={saveDraft}>Save list</button>
                </div>
                <p className="pg-note">
                  Sessions 4 shows these lists in a dropdown above the proxy field of a new session.
                  Each new container grabs the next unused proxy; saving with <b>XSave</b> removes it
                  from this list. Unsaved containers release their proxy back.
                </p>
              </>
            ) : (
              <div className="pg-empty">Create a proxy list to get started.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
