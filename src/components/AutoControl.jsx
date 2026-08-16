// Auto Control — run one published Sessions 4 "Auto" node graph on many PCs at once.
//
// Every running Sessions 4 instance heartbeats a row into `auto_engines` each second
// (engine code, online-ness, per-node run progress). This panel polls those rows plus
// the account's `auto_control` document every second, renders the published node graph
// with real wire positions, shows which engines are online, and issues run/stop
// commands. Each node draws a percentage bar of how many targeted engines performed it,
// plus the engine codes that did.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import Icon from '../Icon'

const NODE_W = 170
const NODE_H = 84
const PAD = 48
const ONLINE_MS = 10000 // heartbeats come every second; 10s of silence = offline

const ACTION_LABELS = {
  click: 'Click', type: 'Type text', keypress: 'Key press', wheel: 'Scroll wheel',
  whatif: 'What if', 'whatif-branch': 'Branch', captcha: 'Solve captcha',
  restart: 'Restart', pageswitch: 'Page Switch', grabber: 'Grabber',
  savecloud: 'Save to Cloud', uploadmedia: 'Upload Media',
  sms: 'SMS', smscode: 'SMS Code', undo: 'Undo', selectall: 'Select All',
  bio: 'Bio Creator', username: 'Username Creator', imageselect: 'Image Selector',
  sniper: 'Sniper Click', apibtn: 'API', xsavebtn: 'XSave', postscript: 'Post Script',
  xrestart: 'XRestart', placeholder: 'New step',
}

function nodeLabel(node) {
  const custom = String(node?.nodeName || '').trim()
  if (custom) return custom
  const action = node?.step?.action || 'click'
  if (action === 'whatif-branch') return node?.step?.branchLabel || 'Branch'
  return ACTION_LABELS[action] || action
}

function newRunId() {
  return 'run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

export default function AutoControl({ userId }) {
  const [control, setControl] = useState(null)   // meta row (graph fetched separately)
  const [graph, setGraph] = useState(null)
  const [engines, setEngines] = useState([])
  const [shots, setShots] = useState([])         // pending Shot check prompts (metadata only)
  const [shotView, setShotView] = useState(null) // prompt opened from a badge (image fetched lazily)
  const [now, setNow] = useState(() => Date.now())
  const [flash, setFlash] = useState('')
  const [missing, setMissing] = useState(false)  // tables not created yet
  const graphStamp = useRef(null)
  const flashTimer = useRef(null)
  const seenManual = useRef(new Set()) // manual screenshots already auto-opened
  const shotViewRef = useRef(null)
  const openShotRef = useRef(null)
  const graphWrapRef = useRef(null)
  const panRef = useRef(null)

  // Click-and-drag panning of the graph pane (drag anywhere — the pane scrolls
  // with the pointer, like grabbing the canvas in the Sessions 4 Auto window).
  const onPanDown = useCallback((e) => {
    if (e.button !== 0) return
    const el = graphWrapRef.current
    if (!el) return
    panRef.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
    el.classList.add('panning')
    e.preventDefault()
    const move = (ev) => {
      const p = panRef.current
      if (!p) return
      el.scrollLeft = p.left - (ev.clientX - p.x)
      el.scrollTop = p.top - (ev.clientY - p.y)
    }
    const up = () => {
      panRef.current = null
      el.classList.remove('panning')
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [])

  const say = useCallback((msg) => {
    setFlash(msg)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(''), 2200)
  }, [])

  // 1-second poll: engine heartbeats + the control document (graph body only when it changed).
  useEffect(() => {
    if (!userId) return
    let stopped = false
    const tick = async () => {
      if (stopped) return
      try {
        const [{ data: eng, error: e1 }, { data: ctl, error: e2 }, { data: sh }] = await Promise.all([
          supabase.from('auto_engines').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
          supabase.from('auto_control').select('graph_name, run_id, command, targets, command_at, updated_at').eq('user_id', userId).maybeSingle(),
          // Shot check prompts (decision '') and on-demand screenshots (decision
          // 'view') — metadata only every second; the image itself is fetched when
          // opened. A missing table = no badges.
          supabase.from('auto_shots').select('id, engine_code, engine_name, node_label, run_id, decision, created_at').eq('user_id', userId).in('decision', ['', 'view']).order('created_at', { ascending: true }),
        ])
        if (stopped) return
        if (e1 || e2) {
          const msg = String(e1?.message || e2?.message || '')
          if (/auto_(engines|control)/.test(msg) && /(does not exist|schema cache)/i.test(msg)) setMissing(true)
          return
        }
        setMissing(false)
        setEngines(eng || [])
        setControl(ctl || null)
        setShots((sh || []).filter((s) => !s.decision))
        setNow(Date.now())
        // A requested screenshot just arrived — open it (unless a prompt is already up).
        const manual = (sh || []).find((s) => s.decision === 'view' && !seenManual.current.has(s.id))
        if (manual && !shotViewRef.current) {
          seenManual.current.add(manual.id)
          openShotRef.current?.({ ...manual, view: true })
        }
        if (ctl && ctl.updated_at !== graphStamp.current) {
          const { data: full } = await supabase.from('auto_control').select('graph, updated_at').eq('user_id', userId).maybeSingle()
          if (stopped || !full) return
          graphStamp.current = full.updated_at
          setGraph(full.graph && typeof full.graph === 'object' ? full.graph : null)
        }
      } catch (e) { console.error(e) }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => { stopped = true; clearInterval(id) }
  }, [userId])

  const isOnline = (e) => now - new Date(e.last_seen || 0).getTime() < ONLINE_MS
  // One row per engine code: a crash/kill can leave a stale row from an older boot
  // behind (the app deletes its own leftovers when it comes back, but until then —
  // and for engines that never return — the freshest heartbeat wins here).
  const byCode = new Map()
  for (const e of engines) {
    const key = String(e.code || e.id)
    const prev = byCode.get(key)
    if (!prev || new Date(e.last_seen || 0) > new Date(prev.last_seen || 0)) byCode.set(key, e)
  }
  const engineList = [...byCode.values()]
  const online = engineList.filter(isOnline)
  const runId = String(control?.run_id || '')
  const targets = Array.isArray(control?.targets) ? control.targets.map(String) : []
  const participants = engineList.filter((e) => runId && String(e.run_id) === runId)
  // Denominator for the bars: the engines this run targets that are online now
  // (an explicit target list wins; empty list = every online engine).
  const targetedOnline = targets.length ? online.filter((e) => targets.includes(String(e.code))) : online
  const denom = Math.max(1, targetedOnline.length)
  const anyRunning = participants.some((e) => e.status === 'running' && isOnline(e))

  const sendCommand = useCallback(async (command, cmdTargets) => {
    if (!control) { say('Publish a graph from the Sessions 4 Auto window first'); return }
    // "reset" stops every PC AND clears the run id, so all bars and per-engine
    // run states fall back to zero — a clean slate for the next Execute.
    const patch = command === 'reset'
      ? { command: 'stop', run_id: '', targets: [], command_at: new Date().toISOString() }
      : {
          command,
          targets: cmdTargets || [],
          command_at: new Date().toISOString(),
          // 'xrestart' = Execute on one engine: it relaunches with a fresh
          // container and runs the published graph under this new run id.
          ...(command === 'run' || command === 'xrestart' ? { run_id: newRunId() } : {}),
        }
    const { error } = await supabase.from('auto_control').update(patch).eq('user_id', userId)
    if (error) { console.error(error); say('Could not send the command'); return }
    setControl((prev) => (prev ? { ...prev, ...patch } : prev))
    say(command === 'run'
      ? (cmdTargets?.length ? `Executing on ${cmdTargets.join(', ')}…` : `Executing on ${online.length} online PC${online.length === 1 ? '' : 's'}…`)
      : command === 'xrestart' ? `XRestart sent to ${cmdTargets?.join(', ') || 'PC'} — it relaunches and runs the preset…`
      : command === 'shot' ? `Screenshot requested from ${cmdTargets?.join(', ') || 'PC'} — it opens here in a moment…`
      : command === 'launch' ? `Launch sent via ${cmdTargets?.join(', ') || 'PC'} — a new Sessions 4 window is starting on that PC…`
      : command === 'newsession' ? `Create New Session sent to ${cmdTargets?.join(', ') || 'PC'}…`
      : command === 'reset' ? 'Progress reset — bars cleared and every PC stopped'
      : cmdTargets?.length ? `Stop sent to ${cmdTargets.join(', ')}` : 'Stop sent to every PC')
  }, [control, userId, online.length, say])

  // A badge's prompt can vanish while open (its engine stopped and cancelled it,
  // or another device decided) — close the stale viewer. On-demand screenshots
  // ('view') aren't in `shots`, so they're never force-closed here.
  useEffect(() => {
    setShotView((prev) => (prev && !prev.view && !shots.some((s) => s.id === prev.id) ? null : prev))
  }, [shots])
  useEffect(() => { shotViewRef.current = shotView }, [shotView])

  // Open a badge: show the modal immediately, pull the screenshot in the background.
  const openShot = useCallback(async (s) => {
    setShotView({ ...s, shot: null })
    const { data, error } = await supabase.from('auto_shots').select('shot').eq('id', s.id).eq('user_id', userId).maybeSingle()
    if (error || !data) { setShotView(null); say('This prompt is gone — the PC stopped or already moved on'); return }
    setShotView((prev) => (prev && prev.id === s.id ? { ...prev, shot: data.shot || '' } : prev))
  }, [userId, say])
  useEffect(() => { openShotRef.current = openShot }, [openShot])

  // Close the viewer; a manual screenshot's row is deleted (it was view-only).
  const dismissShot = useCallback((sv) => {
    setShotView(null)
    if (sv?.view && sv.id) {
      supabase.from('auto_shots').delete().eq('id', sv.id).eq('user_id', userId).then(() => {}, () => {})
    }
  }, [userId])

  // Write the decision back; the Sessions 4 instance polls it within ~1.5s and
  // deletes the row once consumed.
  const decideShot = useCallback(async (shotId, decision) => {
    const { error } = await supabase.from('auto_shots')
      .update({ decision, decided_at: new Date().toISOString() })
      .eq('id', shotId).eq('user_id', userId)
    if (error) { console.error(error); say('Could not send the decision'); return }
    setShots((prev) => prev.filter((s) => s.id !== shotId))
    setShotView(null)
    say(decision === 'continue' ? 'Continuing to the next node'
      : decision === 'retry' ? 'Retrying the node'
      : 'XRestart sent — the PC relaunches and re-runs the preset')
  }, [userId, say])

  // ── Graph geometry ──
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph?.edges) ? graph.edges : []
  const minX = nodes.length ? Math.min(...nodes.map((n) => Number(n.x) || 0)) : 0
  const minY = nodes.length ? Math.min(...nodes.map((n) => Number(n.y) || 0)) : 0
  const pos = new Map(nodes.map((n) => [n.id, {
    x: (Number(n.x) || 0) - minX + PAD,
    y: (Number(n.y) || 0) - minY + PAD,
  }]))
  const canvasW = nodes.length ? Math.max(...[...pos.values()].map((p) => p.x)) + NODE_W + PAD : 0
  const canvasH = nodes.length ? Math.max(...[...pos.values()].map((p) => p.y)) + NODE_H + PAD : 0

  const nodeStats = (nodeId) => {
    const performed = participants.filter((e) => Array.isArray(e.done_nodes) && e.done_nodes.includes(nodeId))
    const live = participants.filter((e) => isOnline(e) && e.status === 'running' && e.node_id === nodeId)
    const pct = Math.min(100, Math.round((performed.length / denom) * 100))
    return { performed, live, pct }
  }

  const engineStatus = (e) => {
    if (!isOnline(e)) return { text: 'Offline', cls: 'off' }
    if (e.status === 'running') {
      const n = nodes.find((x) => x.id === e.node_id)
      return { text: n ? `Running: ${nodeLabel(n)}` : 'Running…', cls: 'run' }
    }
    if (e.status === 'error' && String(e.run_id) === runId) return { text: e.error || 'Failed', cls: 'err' }
    if (e.status === 'done' && String(e.run_id) === runId) return { text: 'Finished ✓', cls: 'ok' }
    return { text: 'Online — idle', cls: 'ok' }
  }

  return (
    <div className="actl">
      <div className="actl-head">
        <span className="actl-title"><Icon name="bolt" size={18} /> Auto Control</span>
        <span className="actl-sub">
          {control?.graph_name ? <>Graph: <b>{control.graph_name}</b></> : 'Published node graph'}
          {control?.updated_at && <span className="actl-stamp"> · published {new Date(control.updated_at).toLocaleString()}</span>}
        </span>
        <div className="grow" />
        <button
          className="btn primary sm"
          disabled={!nodes.length || !online.length}
          onClick={() => sendCommand('run', [])}
          title="Run the published graph on every online Sessions 4 PC at the same time"
        >
          Execute all ({online.length} online)
        </button>
        <button className="btn ghost sm" disabled={!anyRunning} onClick={() => sendCommand('stop', [])} title="Stop the run on every PC">
          Stop all
        </button>
        <button className="btn ghost sm" disabled={!control || !runId} onClick={() => sendCommand('reset', [])} title="Reset the node graph's progress — stops every PC and clears all percentage bars and performed-by chips">
          Reset
        </button>
      </div>

      {missing && (
        <div className="actl-empty">
          The Auto Control tables are missing — run the updated <b>sessions-table/supabase.sql</b> in the Supabase SQL editor first.
        </div>
      )}

      {shotView && (
        <div className="actl-shot-modal" onClick={() => dismissShot(shotView)}>
          <div className="actl-shot-card" onClick={(e) => e.stopPropagation()}>
            <div className="actl-shot-title">
              {shotView.view
                ? <>Screenshot — <b>{shotView.engine_code}</b>{shotView.engine_name ? ` (${shotView.engine_name})` : ''}</>
                : <>Shot check — <b>{shotView.node_label || 'node'}</b> just ran on {shotView.engine_code}{shotView.engine_name ? ` (${shotView.engine_name})` : ''}. What next?</>}
            </div>
            <div className="actl-shot-imgwrap">
              {shotView.shot == null
                ? <div className="actl-shot-loading">Loading screenshot…</div>
                : shotView.shot
                  ? <img src={shotView.shot} alt="Browser screenshot" />
                  : <div className="actl-shot-loading">{shotView.view ? 'Nothing to capture — no container is open on that PC.' : 'No screenshot was captured — decide from what the PC reports.'}</div>}
            </div>
            <div className="actl-shot-actions">
              {shotView.view ? (
                <button className="btn primary sm" onClick={() => dismissShot(shotView)}>Close</button>
              ) : (
                <>
                  <button className="btn primary sm" onClick={() => decideShot(shotView.id, 'continue')} title="Everything looks right — move on to the next node">
                    Continue to next node
                  </button>
                  <button className="btn ghost sm" onClick={() => decideShot(shotView.id, 'retry')} title="Run this same node again">
                    Retry this node
                  </button>
                  <button className="btn ghost sm actl-shot-danger" onClick={() => decideShot(shotView.id, 'xrestart')} title="Close Sessions 4 completely on that PC, relaunch it with a fresh container, and re-run the preset from the beginning">
                    XRestart
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="actl-body">
        <div className="actl-engines">
          <div className="actl-engines-head">
            Sessions 4 PCs <span className="actl-count">{online.length} online</span>
          </div>
          {!engineList.length && (
            <div className="actl-engines-empty">
              No PCs seen yet. Open Sessions 4 (signed in to this account) and its engine
              code appears here within a second.
            </div>
          )}
          {engineList.map((e) => {
            const st = engineStatus(e)
            const on = isOnline(e)
            const isRunning = on && e.status === 'running'
            const hasError = on && e.status === 'error'
            const pendingShot = shots.find((sh) => String(sh.engine_code) === String(e.code))
            // Offline engine: another online instance on the same PC (hostname
            // without the " #2" suffix) can spawn a new Sessions 4 window there.
            const baseHost = (n) => String(n || '').replace(/ #\d+$/, '').trim().toLowerCase()
            const launcher = !on && baseHost(e.name)
              ? online.find((o) => baseHost(o.name) === baseHost(e.name))
              : null
            const statusText = !on
              ? (launcher ? `Offline — PC online via ${launcher.code}` : 'Offline — PC not reachable')
              : st.text
            return (
              <div key={e.id} className={'actl-engine' + (on ? '' : ' offline')}>
                <span className={'actl-dot ' + (on ? 'on' : 'off')} />
                <div className="actl-engine-main">
                  <span className="actl-engine-code">{e.code || '——————'}</span>
                  <span className="actl-engine-name" title={e.name}>{e.name || 'PC'}</span>
                  <span className={'actl-engine-status ' + st.cls} title={statusText}>{statusText}</span>
                </div>
                {pendingShot ? (
                  <button
                    className="actl-shot-badge"
                    onClick={() => openShot(pendingShot)}
                    title={`${e.code} is waiting for your decision on “${pendingShot.node_label || 'node'}” — open the screenshot`}
                  >
                    <span className="actl-shot-ping" />
                    <span className="actl-shot-badge-main">
                      <span className="actl-shot-badge-label">Shot check</span>
                      <span className="actl-shot-badge-sub">{pendingShot.node_label || 'node'}</span>
                    </span>
                  </button>
                ) : (
                  <div className="actl-engine-btns">
                    {on && (
                      <button
                        className="btn ghost sm"
                        onClick={() => sendCommand('shot', [String(e.code)])}
                        title={`Take a screenshot of ${e.code}'s browser right now`}
                      >
                        Screenshot
                      </button>
                    )}
                    {on && !isRunning && (
                      <button
                        className="btn ghost sm"
                        onClick={() => sendCommand('newsession', [String(e.code)])}
                        title={`Press Create New Session on ${e.code}`}
                      >
                        New session
                      </button>
                    )}
                    {isRunning ? (
                      <button
                        className="btn ghost sm actl-stop-btn"
                        onClick={() => sendCommand('stop', [String(e.code)])}
                        title={`Stop the run on ${e.code}`}
                      >
                        Stop
                      </button>
                    ) : hasError ? (
                      <button
                        className="btn ghost sm actl-stop-btn"
                        disabled={!nodes.length}
                        onClick={() => sendCommand('xrestart', [String(e.code)])}
                        title={`${e.code} reported an error — XRestart relaunches it with a fresh container and re-runs the published graph`}
                      >
                        XRestart
                      </button>
                    ) : on ? (
                      <button
                        className="btn ghost sm"
                        disabled={!nodes.length}
                        onClick={() => sendCommand('xrestart', [String(e.code)])}
                        title={`Execute on ${e.code}: the app relaunches with a fresh container and runs the published graph`}
                      >
                        Execute
                      </button>
                    ) : (
                      <button
                        className="btn ghost sm"
                        disabled={!launcher}
                        onClick={() => launcher && sendCommand('launch', [String(launcher.code)])}
                        title={launcher
                          ? `Launch a new Sessions 4 window on ${e.name || 'that PC'} via the online instance ${launcher.code}`
                          : 'No online Sessions 4 instance on that PC — open the app there manually first'}
                      >
                        Execute
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="actl-graph-wrap" ref={graphWrapRef} onMouseDown={onPanDown}>
          {!nodes.length ? (
            <div className="actl-empty">
              No graph published yet. In Sessions 4, open <b>Auto</b>, build your nodes and
              press <b>Publish</b> — the graph shows up here for every PC to run.
            </div>
          ) : (
            <div className="actl-graph" style={{ width: canvasW, height: canvasH }}>
              <svg className="actl-wires" width={canvasW} height={canvasH}>
                {edges.map((ed) => {
                  const a = pos.get(ed.from)
                  const b = pos.get(ed.to)
                  if (!a || !b) return null
                  const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2
                  const x2 = b.x, y2 = b.y + NODE_H / 2
                  const dx = Math.max(36, Math.abs(x2 - x1) / 2)
                  return (
                    <path
                      key={ed.id}
                      d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                      className="actl-wire"
                    />
                  )
                })}
              </svg>
              {nodes.map((n) => {
                const p = pos.get(n.id)
                const { performed, live, pct } = nodeStats(n.id)
                const chips = performed.map((e) => String(e.code)).slice(0, 5)
                const extra = performed.length - chips.length
                return (
                  <div
                    key={n.id}
                    className={'actl-node' + (live.length ? ' live' : '') + (pct >= 100 ? ' complete' : '')}
                    style={{ left: p.x, top: p.y, width: NODE_W, minHeight: NODE_H }}
                  >
                    <div className="actl-node-head">
                      <span className="actl-node-label" title={nodeLabel(n)}>{nodeLabel(n)}</span>
                      {live.length > 0 && <span className="actl-node-live" title={`Running now on ${live.map((e) => e.code).join(', ')}`} />}
                    </div>
                    <div className="actl-bar" title={`${performed.length} of ${denom} PC${denom === 1 ? '' : 's'} performed this node`}>
                      <div className="actl-bar-fill" style={{ width: pct + '%' }} />
                      <span className="actl-bar-pct">{pct}%</span>
                    </div>
                    <div className="actl-node-chips">
                      {chips.length
                        ? <>{chips.map((c) => <span key={c} className="actl-chip" title={`Performed by ${c}`}>{c}</span>)}{extra > 0 && <span className="actl-chip more">+{extra}</span>}</>
                        : <span className="actl-node-none">no PC yet</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {flash && <div className="st-toast">{flash}</div>}
    </div>
  )
}
