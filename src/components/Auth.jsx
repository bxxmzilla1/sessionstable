import { useState } from 'react'
import { supabase } from '../supabaseClient'
import Icon from '../Icon'

export default function Auth() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  function switchMode(m) {
    setMode(m); setErr(''); setMsg('')
  }

  async function submit(e) {
    e.preventDefault()
    setErr(''); setMsg(''); setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
        if (error) throw error
        if (!data.session) {
          setMsg('Account created. If email confirmation is on, confirm it, then sign in.')
          setMode('signin')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      }
    } catch (e2) {
      setErr(e2.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo" aria-hidden="true"><Icon name="table" size={26} /></div>
        <h1>Sessions Table</h1>
        <p className="sub">Sign in with your Sessions account.</p>

        <div className="tabs">
          <button type="button" className={mode === 'signin' ? 'on' : ''} onClick={() => switchMode('signin')}>Sign in</button>
          <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => switchMode('signup')}>Sign up</button>
        </div>

        {err && <div className="alert error">{err}</div>}
        {msg && <div className="alert ok">{msg}</div>}

        <label>Email</label>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" autoComplete="username" required
        />

        <label>Password</label>
        <div className="pw">
          <input
            type={show ? 'text' : 'password'} value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required
          />
          <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>

        <button className="btn primary block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
