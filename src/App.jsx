import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './components/Auth'
import Toolbar from './components/Toolbar'
import Spreadsheet from './components/Spreadsheet'

const DEFAULT_SHEET = () => ({ title: 'Sheet 1', rows: 50, cols: 12, cells: {}, formats: {} })

function normalize(d) {
  return {
    title: d.title || 'Sheet 1',
    rows: Math.max(1, d.rows || 50),
    cols: Math.max(1, d.cols || 12),
    cells: d.cells || {},
    formats: d.formats || {},
  }
}

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [sheet, setSheet] = useState(null)
  const [selected, setSelected] = useState({ r: 0, c: 0 })
  const [status, setStatus] = useState('idle') // idle | saving | saved | error
  const saveTimer = useRef(null)
  const loadedFor = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) { setSheet(null); loadedFor.current = null; return }
    if (loadedFor.current === session.user.id) return
    loadedFor.current = session.user.id
    ;(async () => {
      const { data, error } = await supabase
        .from('sheets').select('data').eq('user_id', session.user.id).maybeSingle()
      if (error) { console.error(error); setSheet(DEFAULT_SHEET()); return }
      setSheet(data?.data?.rows ? normalize(data.data) : DEFAULT_SHEET())
    })()
  }, [session])

  const scheduleSave = useCallback((next) => {
    if (!session?.user) return
    setStatus('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase.from('sheets').upsert(
        { user_id: session.user.id, data: next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      setStatus(error ? 'error' : 'saved')
      if (error) console.error(error)
    }, 700)
  }, [session])

  const update = useCallback((mutator) => {
    setSheet((prev) => {
      const next = mutator(prev)
      scheduleSave(next)
      return next
    })
  }, [scheduleSave])

  const setCell = (r, c, value) => update((prev) => {
    const cells = { ...prev.cells }
    const k = r + ',' + c
    if (value === '' || value == null) delete cells[k]
    else cells[k] = value
    return { ...prev, cells }
  })

  const applyFormat = (patch) => update((prev) => {
    const k = selected.r + ',' + selected.c
    const cur = prev.formats[k] || {}
    const merged = { ...cur, ...patch }
    Object.keys(merged).forEach((key) => {
      if (merged[key] === false || merged[key] === '' || merged[key] == null) delete merged[key]
    })
    const formats = { ...prev.formats }
    if (Object.keys(merged).length) formats[k] = merged
    else delete formats[k]
    return { ...prev, formats }
  })

  const addRow = () => update((prev) => ({ ...prev, rows: Math.min(prev.rows + 1, 500) }))
  const addCol = () => update((prev) => ({ ...prev, cols: Math.min(prev.cols + 1, 52) }))
  const setTitle = (title) => update((prev) => ({ ...prev, title }))

  if (!ready) return <div className="center muted">Loading…</div>
  if (!session) return <Auth />
  if (!sheet) return <div className="center muted">Opening your sheet…</div>

  const selKey = selected.r + ',' + selected.c

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo" aria-hidden="true">▦</span> Sessions Table</div>
        <div className="grow" />
        <span className={'save ' + status}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'All changes saved' : status === 'error' ? 'Save failed' : ''}
        </span>
        <span className="email" title={session.user.email}>{session.user.email}</span>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <Toolbar
        title={sheet.title}
        onTitle={setTitle}
        format={sheet.formats[selKey] || {}}
        onFormat={applyFormat}
        onAddRow={addRow}
        onAddCol={addCol}
        selected={selected}
        cellRaw={sheet.cells[selKey] || ''}
        onFormula={(v) => setCell(selected.r, selected.c, v)}
      />

      <Spreadsheet
        sheet={sheet}
        selected={selected}
        onSelect={(r, c) => setSelected({ r, c })}
        onEdit={setCell}
      />
    </div>
  )
}
