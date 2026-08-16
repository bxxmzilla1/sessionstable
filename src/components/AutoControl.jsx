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
  const [now, setNow] = useState(() => Date.now())
  const [flash, setFlash] = useState('')
  const [missing, setMissing] = useState(false)  // tables not created yet
  const graphStamp = useRef(null)
  const flashTimer = useRef(null)

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
        const [{ data: eng, error: e1 }, { data: ctl, error: e2 }] = await Promise.all([
          supabase.from('auto_engines').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
          supabase.from('auto_control').select('graph_name, run_id, command, targets, command_at, updated_at').eq('user_id', userId).maybeSingle(),
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
        setNow(Date.now())
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
          ...(command === 'run' ? { run_id: newRunId() } : {}),
        }
    const { error } = await supabase.from('auto_control').update(patch).eq('user_id', userId)
    if (error) { console.error(error); say('Could not send the command'); return }
    setControl((prev) => (prev ? { ...prev, ...patch } : prev))
    say(command === 'run'
      ? (cmdTargets?.length ? `Executing on ${cmdTargets.join(', ')}…` : `Executing on ${online.length} online PC${online.length === 1 ? '' : 's'}…`)
      : command === 'reset' ? 'Progress reset — bars cleared and every PC stopped'
      : 'Stop sent to every PC')
  }, [control, userId, online.length, say])

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
            return (
              <div key={e.id} className={'actl-engine' + (on ? '' : ' offline')}>
                <span className={'actl-dot ' + (on ? 'on' : 'off')} />
                <div className="actl-engine-main">
                  <span className="actl-engine-code">{e.code || '——————'}</span>
                  <span className="actl-engine-name" title={e.name}>{e.name || 'PC'}</span>
                  <span className={'actl-engine-status ' + st.cls} title={st.text}>{st.text}</span>
                </div>
                <button
                  className="btn ghost sm"
                  disabled={!on || !nodes.length}
                  onClick={() => sendCommand('run', [String(e.code)])}
                  title={`Run the published graph on ${e.code} only`}
                >
                  Execute
                </button>
              </div>
            )
          })}
        </div>

        <div className="actl-graph-wrap">
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
