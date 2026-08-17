// Sessions Lite — fleet control panel for the lightweight headless-browser app.
//
// Every running Sessions Lite instance heartbeats a row into `auto_engines` each second
// (name 'Sessions Lite', engine code, and how many headless browsers it's running).
// This panel lists those PCs, and for each online one can spin up a new headless
// browser, stop them all, or pull a live screenshot — commands travel through the
// account's `auto_control` row and are picked up by the PC within a second.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import Icon from '../Icon'

const ONLINE_MS = 10000 // heartbeats come every second; 10s of silence = offline

export default function SessionsLite({ userId }) {
  const [engines, setEngines] = useState([])
  const [now, setNow] = useState(() => Date.now())
  const [flash, setFlash] = useState('')
  const [missing, setMissing] = useState(false)
  const [shotView, setShotView] = useState(null) // { id, engine_code, engine_name, shot|null }
  const flashTimer = useRef(null)
  const seenShots = useRef(new Set())
  const shotViewRef = useRef(null)
  const openShotRef = useRef(null)

  const say = useCallback((msg) => {
    setFlash(msg)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(''), 2400)
  }, [])

  // 1-second poll: heartbeats + on-demand screenshots (image fetched only when opened).
  useEffect(() => {
    if (!userId) return
    let stopped = false
    const tick = async () => {
      if (stopped) return
      try {
        const [{ data: eng, error: e1 }, { data: sh }] = await Promise.all([
          supabase.from('auto_engines').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
          supabase.from('auto_shots').select('id, engine_code, engine_name, created_at').eq('user_id', userId).eq('decision', 'view').order('created_at', { ascending: true }),
        ])
        if (stopped) return
        if (e1) {
          if (/auto_engines/.test(String(e1.message || '')) && /(does not exist|schema cache)/i.test(String(e1.message || ''))) setMissing(true)
          return
        }
        setMissing(false)
        setEngines(eng || [])
        setNow(Date.now())
        const fresh = (sh || []).find((s) => !seenShots.current.has(s.id))
        if (fresh && !shotViewRef.current) {
          seenShots.current.add(fresh.id)
          openShotRef.current?.(fresh)
        }
      } catch (e) { console.error(e) }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => { stopped = true; clearInterval(id) }
  }, [userId])

  const isOnline = (e) => now - new Date(e.last_seen || 0).getTime() < ONLINE_MS

  // Only Sessions Lite instances (the desktop app's engines live in Auto Control);
  // one row per engine code — the freshest heartbeat wins over stale crash leftovers.
  const byCode = new Map()
  for (const e of engines) {
    if (String(e.name || '') !== 'Sessions Lite') continue
    const key = String(e.code || e.id)
    const prev = byCode.get(key)
    if (!prev || new Date(e.last_seen || 0) > new Date(prev.last_seen || 0)) byCode.set(key, e)
  }
  const pcs = [...byCode.values()].sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)))
  const online = pcs.filter(isOnline)

  // Commands ride the account's auto_control row (upsert: the row may not exist yet if
  // no Auto graph was ever published). Targeted by engine code, picked up within ~1s.
  const sendCommand = useCallback(async (command, targets, msg) => {
    const { error } = await supabase.from('auto_control').upsert({
      user_id: userId,
      command,
      targets: targets || [],
      command_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) { console.error(error); say('Could not send the command'); return }
    say(msg)
  }, [userId, say])

  // Open a screenshot: modal first, image in the background; the row is display-only
  // and gets deleted on close.
  const openShot = useCallback(async (s) => {
    setShotView({ ...s, shot: null })
    const { data, error } = await supabase.from('auto_shots').select('shot').eq('id', s.id).eq('user_id', userId).maybeSingle()
    if (error || !data) { setShotView(null); return }
    setShotView((prev) => (prev && prev.id === s.id ? { ...prev, shot: data.shot || '' } : prev))
  }, [userId])
  useEffect(() => { shotViewRef.current = shotView }, [shotView])
  useEffect(() => { openShotRef.current = openShot }, [openShot])

  const dismissShot = useCallback((sv) => {
    setShotView(null)
    if (sv?.id) supabase.from('auto_shots').delete().eq('id', sv.id).eq('user_id', userId).then(() => {}, () => {})
  }, [userId])

  const statusText = (e) => {
    if (!isOnline(e)) return { text: 'Offline', cls: 'off' }
    if (e.node_id) return { text: e.node_id, cls: e.status === 'running' ? 'run' : 'ok' }
    return { text: 'Online — no headless browsers yet', cls: 'ok' }
  }

  return (
    <div className="slt">
      <div className="slt-head">
        <div className="slt-badge"><Icon name="rocket" size={22} /></div>
        <div>
          <h1>Sessions Lite</h1>
          <p className="slt-sub">Every PC running Sessions Lite on this account. Spin up headless browsers on any online PC.</p>
        </div>
        <div className="grow" />
        <span className="slt-count">{online.length} online</span>
      </div>

      {missing && (
        <div className="slt-empty">
          The Auto Control tables are missing — run the updated <b>sessions-table/supabase.sql</b> in the Supabase SQL editor first.
        </div>
      )}

      {!missing && !pcs.length && (
        <div className="slt-empty">
          No PCs seen yet. Start Sessions Lite (signed in to this account) on any computer and
          it appears here within a second.
        </div>
      )}

      <div className="slt-grid">
        {pcs.map((e) => {
          const on = isOnline(e)
          const st = statusText(e)
          return (
            <div key={e.id} className={'slt-card' + (on ? '' : ' offline')}>
              <div className="slt-card-top">
                <span className={'actl-dot ' + (on ? 'on' : 'off')} />
                <span className="slt-code">{e.code || '——————'}</span>
                <span className="slt-name" title={e.nickname ? `${e.nickname} — this PC` : 'This PC'}>
                  {e.nickname || 'PC'}
                </span>
              </div>
              <div className={'slt-status ' + st.cls}>{st.text}</div>
              <div className="slt-actions">
                <button
                  className="btn primary sm"
                  disabled={!on}
                  onClick={() => sendCommand('newsession', [String(e.code)], `New headless browser starting on ${e.nickname || e.code}…`)}
                  title={on ? `Create and launch a new headless browser on ${e.code}` : 'This PC is offline'}
                >
                  New headless browser
                </button>
                <button
                  className="btn ghost sm"
                  disabled={!on}
                  onClick={() => sendCommand('shot', [String(e.code)], `Screenshot requested from ${e.nickname || e.code} — it opens here in a moment…`)}
                  title={`See what ${e.code}'s active browser is showing right now`}
                >
                  Screenshot
                </button>
                <button
                  className="btn ghost sm slt-danger"
                  disabled={!on}
                  onClick={() => sendCommand('stopall', [String(e.code)], `Stopping every headless browser on ${e.nickname || e.code}`)}
                  title={`Stop every headless browser running on ${e.code}`}
                >
                  Stop all
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {shotView && (
        <div className="actl-shot-modal" onClick={() => dismissShot(shotView)}>
          <div className="actl-shot-card" onClick={(ev) => ev.stopPropagation()}>
            <div className="actl-shot-title">
              Screenshot — <b>{shotView.engine_code}</b>{shotView.engine_name ? ` (${shotView.engine_name})` : ''}
            </div>
            <div className="actl-shot-imgwrap">
              {shotView.shot == null
                ? <div className="actl-shot-loading">Loading screenshot…</div>
                : shotView.shot
                  ? <img src={shotView.shot} alt="Headless browser screenshot" />
                  : <div className="actl-shot-loading">Nothing to capture — no headless browser is running on that PC.</div>}
            </div>
            <div className="actl-shot-actions">
              <button className="btn primary sm" onClick={() => dismissShot(shotView)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {flash && <div className="st-toast">{flash}</div>}
    </div>
  )
}
