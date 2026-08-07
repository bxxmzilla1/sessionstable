// bundle.social integration for the PWA.
// The API key lives in Supabase auth user metadata (`bundle_key`) so it follows the
// account across devices — the same account Sessions 4 signs into.
import { supabase } from './supabaseClient'

const BUNDLE_BASE = 'https://api.bundle.social'

export async function getBundleKey() {
  try {
    const { data } = await supabase.auth.getUser()
    return String(data?.user?.user_metadata?.bundle_key || '')
  } catch (e) {
    return ''
  }
}

export async function setBundleKey(key) {
  const { error } = await supabase.auth.updateUser({ data: { bundle_key: String(key || '').trim() } })
  if (error) throw new Error(error.message)
}

/**
 * Best-effort: permanently delete bundle.social teams (each takes its connected Instagram,
 * posts and uploads with it). Failures are collected, not thrown, so a missing key or a
 * network block never prevents the row/link deletion that triggered this.
 */
export async function deleteBundleTeams(teamIds) {
  const ids = [...new Set((teamIds || []).filter(Boolean))]
  if (!ids.length) return { deleted: 0, errors: [] }
  const key = await getBundleKey()
  if (!key) return { deleted: 0, errors: ['No bundle.social API key set (Settings)'] }
  let deleted = 0
  const errors = []
  await Promise.all(ids.map(async (id) => {
    try {
      const res = await fetch(`${BUNDLE_BASE}/api/v1/team/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-api-key': key },
      })
      if (!res.ok) {
        let msg = res.statusText || `HTTP ${res.status}`
        try { msg = (await res.json())?.message || msg } catch (e) {}
        throw new Error(msg)
      }
      deleted++
    } catch (e) {
      errors.push(`Team ${id}: ${e?.message || e}`)
    }
  }))
  return { deleted, errors }
}
