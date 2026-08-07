import { useEffect, useState } from 'react'
import { getBundleKey, setBundleKey } from '../bundle'

export default function SettingsModal({ onClose }) {
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [state, setState] = useState('loading') // loading | idle | saving | saved | error
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    getBundleKey().then((k) => { if (alive) { setKey(k); setState('idle') } })
    return () => { alive = false }
  }, [])

  const save = async () => {
    setState('saving')
    setError('')
    try {
      await setBundleKey(key)
      setState('saved')
      setTimeout(() => setState('idle'), 1500)
    } catch (e) {
      setError(e?.message || 'Could not save the key')
      setState('error')
    }
  }

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sm-head">
          <div className="sm-title">Settings</div>
          <button className="icon-btn" onClick={onClose} title="Close">×</button>
        </div>
        <div className="sm-body">
          <div className="sm-section">API keys</div>
          <label className="sm-label" htmlFor="sm-bundle-key">bundle.social API key</label>
          <div className="sm-key-row">
            <input
              id="sm-bundle-key"
              type={show ? 'text' : 'password'}
              value={key}
              placeholder="bndl_…"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            />
            <button className="btn ghost sm" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
          </div>
          <p className="sm-hint">
            Saved to your account, so it works on every device. Used to delete the matching
            bundle.social team (and its connected Instagram) when a row saved by Sessions 4
            is deleted here.
          </p>
          {error && <p className="sm-error">{error}</p>}
        </div>
        <div className="sm-foot">
          <div className="grow" />
          <button className="btn primary sm" onClick={save} disabled={state === 'loading' || state === 'saving'}>
            {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
