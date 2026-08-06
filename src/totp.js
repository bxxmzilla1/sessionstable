// RFC 6238 TOTP for the browser (Web Crypto). A "2FA" column stores the base32 setup key in each
// cell; these helpers turn that key into the live 6-digit code and the seconds left before it rolls.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const TOTP_STEP = 30
const DIGITS = 6

export function base32Decode(input) {
  const clean = String(input || '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
  let bits = ''
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch)
    if (idx < 0) continue // skip any stray non-base32 character
    bits += idx.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return new Uint8Array(bytes)
}

// A real base32 secret is only A–Z/2–7 and decodes to enough bytes to be a usable HMAC key. This
// keeps the transform button from lighting up on ordinary text that just happens to sit in the cell.
export function isValidSecret(text) {
  const clean = String(text || '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
  return /^[A-Z2-7]+$/.test(clean) && base32Decode(clean).length >= 10
}

export function secondsRemaining(at = Date.now()) {
  return TOTP_STEP - (Math.floor(at / 1000) % TOTP_STEP)
}

export async function totp(secret, at = Date.now()) {
  const key = base32Decode(secret)
  if (!key.length || !globalThis.crypto?.subtle) return ''
  let counter = Math.floor(at / 1000 / TOTP_STEP)
  const buf = new Uint8Array(8)
  for (let i = 7; i >= 0; i--) { buf[i] = counter & 0xff; counter = Math.floor(counter / 256) }
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, buf))
  const offset = sig[sig.length - 1] & 0x0f
  const bin = ((sig[offset] & 0x7f) << 24) | ((sig[offset + 1] & 0xff) << 16)
    | ((sig[offset + 2] & 0xff) << 8) | (sig[offset + 3] & 0xff)
  return String(bin % (10 ** DIGITS)).padStart(DIGITS, '0')
}
