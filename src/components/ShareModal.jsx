import { useState } from 'react'
import Icon from '../Icon'

const pretty = (code) => (code && code.length === 8 ? code.slice(0, 4) + '-' + code.slice(4) : code || '')

/** Owner side: show / copy the workspace share code, or stop sharing. */
export function ShareModal({ workspaceName, code, onRevoke, onClose }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pretty(code))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked */ }
  }

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sm-head">
          <div className="sm-title">Share workspace</div>
          <button className="icon-btn" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
        </div>
        <div className="sm-body">
          <div className="sm-section">{workspaceName}</div>
          <p className="sm-hint">
            Anyone with this code can open, edit, and use this workspace from their own
            Sessions account — including sending its proxies to their own phone's VPN screen.
          </p>
          <div className="share-code-row">
            <div className="share-code">{pretty(code)}</div>
            <button className="btn primary sm" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</button>
          </div>
        </div>
        <div className="sm-foot">
          <button className="btn ghost sm danger-text" onClick={onRevoke}>Stop sharing</button>
          <div className="grow" />
          <button className="btn primary sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

/** Joiner side: enter a code to get access to someone else's workspace. */
export function JoinModal({ onJoin, onClose }) {
  const [code, setCode] = useState('')
  const [state, setState] = useState('idle') // idle | joining | error
  const [error, setError] = useState('')

  const join = async () => {
    const clean = code.replace(/[^a-z0-9]/gi, '').toUpperCase()
    if (clean.length < 4) { setError('Enter the full share code'); setState('error'); return }
    setState('joining')
    setError('')
    try {
      await onJoin(clean)
      onClose()
    } catch (e) {
      setError(e?.message || 'Could not join — check the code')
      setState('error')
    }
  }

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sm-head">
          <div className="sm-title">Join a shared workspace</div>
          <button className="icon-btn" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
        </div>
        <div className="sm-body">
          <label className="sm-label" htmlFor="share-join-code">Share code</label>
          <div className="sm-key-row">
            <input
              id="share-join-code"
              value={code}
              placeholder="XXXX-XXXX"
              spellCheck={false}
              autoComplete="off"
              autoFocus
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') join() }}
            />
          </div>
          <p className="sm-hint">Paste the code the workspace owner sent you. The workspace appears on your Home and stays in sync for everyone.</p>
          {error && <p className="sm-error">{error}</p>}
        </div>
        <div className="sm-foot">
          <div className="grow" />
          <button className="btn primary sm" onClick={join} disabled={state === 'joining'}>
            {state === 'joining' ? 'Joining…' : 'Join workspace'}
          </button>
        </div>
      </div>
    </div>
  )
}
