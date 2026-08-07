// Proxy string handling for the VPN screen — ported from the Proxzey project so
// the exact same formats Sessions exports are understood, and the Shadowrocket
// URI is byte-for-byte what Shadowrocket's own "Share" produces.

// Accepts the formats Sessions/Proxzey use:
//   host:port
//   host:port:user:pass          (pass may contain ':')
//   socks5://host:port:user:pass
//   http://user:pass@host:port
//   socks5://user:pass@host:port#label
export function parseProxyString(raw) {
  let s = String(raw || '').trim().replace(/^\uFEFF/, '')
  s = s.replace(/^[|>\s]+/u, '').replace(/[|>\s]+$/u, '').trim()
  if (!s) return null

  let label = ''
  const hash = s.indexOf('#')
  if (hash !== -1) {
    try { label = decodeURIComponent(s.slice(hash + 1)) } catch { label = s.slice(hash + 1) }
    s = s.slice(0, hash)
  }

  let type = 'http'
  let rest = s
  const protoMatch = s.match(/^(socks5|socks4|https?|ss):\/\//i)
  if (protoMatch) {
    const proto = protoMatch[1].toLowerCase()
    type = proto === 'socks5' || proto === 'socks4' ? 'socks' : proto === 'https' ? 'http' : proto
    rest = s.slice(protoMatch[0].length)
  }

  // user:pass@host:port  (pass may be percent-encoded or base64(user:pass))
  const atMatch = rest.match(/^([^:@]+):([^@]*)@([^:/?#]+):(\d+)$/)
  if (atMatch) {
    let user = atMatch[1]
    let pass = atMatch[2]
    try { user = decodeURIComponent(user) } catch { /* keep */ }
    try { pass = decodeURIComponent(pass) } catch { /* keep */ }
    if (!pass && /^[A-Za-z0-9+/=]+$/.test(user)) {
      try {
        const decoded = atob(user)
        const colon = decoded.indexOf(':')
        if (colon !== -1) { pass = decoded.slice(colon + 1); user = decoded.slice(0, colon) }
      } catch { /* not base64 */ }
    }
    return { scheme: type, host: atMatch[3], port: atMatch[4], username: user, password: pass, label }
  }

  // host:port:user:pass+  (pass may include ':')
  const parts = rest.split(':')
  if (parts.length >= 4 && /^\d+$/.test(parts[1])) {
    return { scheme: type, host: parts[0], port: parts[1], username: parts[2], password: parts.slice(3).join(':'), label }
  }
  if (parts.length === 2 && /^\d+$/.test(parts[1])) {
    return { scheme: type, host: parts[0], port: parts[1], username: '', password: '', label }
  }
  return null
}

// Build a DIRECT Shadowrocket proxy URI. Opening this on iOS adds/updates a single
// node of the right type. Keep `label` STABLE so Shadowrocket keeps it selected
// across updates (it tracks the chosen node by name).
export function buildProxyUri(p, label) {
  const name = encodeURIComponent(label || p.label || 'Sessions VPN')
  const hostPort = `${p.host}:${p.port}`
  const user = p.username != null ? encodeURIComponent(String(p.username)) : ''
  const pass = p.password != null ? encodeURIComponent(String(p.password)) : ''
  const cred = user ? `${user}:${pass}@` : ''
  switch (p.scheme) {
    case 'ss':
      return `ss://${b64(`${p.username}:${p.password}`)}@${hostPort}#${name}`
    case 'http':
      return `http://${cred}${hostPort}#${name}`
    case 'socks':
    default:
      return `socks5://${cred}${hostPort}#${name}`
  }
}

// The deep link that hands Shadowrocket the node in one tap. `shadowrocket://add/`
// is the explicit add-scheme; opening the bare proxy URI also works but this is
// unambiguous across Shadowrocket versions.
export function shadowrocketLink(p, label) {
  return 'shadowrocket://add/' + encodeURIComponent(buildProxyUri(p, label))
}

// A short, non-identifying preview: scheme + host with only the last segment shown.
export function proxyPreview(p) {
  if (!p) return ''
  const host = String(p.host || '')
  const seg = host.split('.')
  const masked = seg.length > 1 ? '···.' + seg[seg.length - 1] : host
  const scheme = p.scheme === 'socks' ? 'SOCKS5' : (p.scheme || 'http').toUpperCase()
  return `${scheme} · ${masked}:${p.port}`
}

function b64(s) {
  try { return btoa(s) } catch { return s }
}
