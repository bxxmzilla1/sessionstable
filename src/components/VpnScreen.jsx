import { useEffect, useMemo, useState } from 'react'
import Icon from '../Icon'
import { parseProxyString, shadowrocketLink, proxyPreview } from '../lib/proxy'

const findProxyField = (table) =>
  (table?.fields || []).find((f) => f.type === 'text' && String(f.name || '').trim().toLowerCase() === 'proxy')

// A friendly row name: primary field, else Container / Username, else "Row N".
function rowLabel(table, rec, index) {
  const byName = (name) => (table.fields || []).find((f) => String(f.name || '').trim().toLowerCase() === name)
  const primary = table.primaryFieldId && rec.cells[table.primaryFieldId]
  const container = byName('container') && rec.cells[byName('container').id]
  const username = byName('username') && rec.cells[byName('username').id]
  return String(primary || container || username || `Row ${index + 1}`)
}

export default function VpnScreen({ store, preset, onConsumePreset }) {
  const workspaces = store.workspaces || []
  const [wsId, setWsId] = useState(preset?.wsId || workspaces[0]?.id || null)

  const ws = workspaces.find((w) => w.id === wsId) || null
  const tables = ws?.tables || []
  const [tableId, setTableId] = useState(preset?.tableId || tables[0]?.id || null)

  const table = tables.find((t) => t.id === tableId) || tables[0] || null
  const proxyField = findProxyField(table)
  const rows = useMemo(
    () => (table?.records || []).filter((r) => proxyField && String(r.cells[proxyField.id] || '').trim()),
    [table, proxyField]
  )
  const [recordId, setRecordId] = useState(preset?.recordId || rows[0]?.id || null)
  const [copied, setCopied] = useState(false)

  // A desktop "send to phone" tap arrives as a new preset — jump straight to it.
  useEffect(() => {
    if (!preset) return
    if (preset.wsId) setWsId(preset.wsId)
    if (preset.tableId) setTableId(preset.tableId)
    if (preset.recordId) setRecordId(preset.recordId)
    onConsumePreset?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.at])

  // Keep table/row selections valid as the workspace/table changes.
  useEffect(() => {
    if (!tables.some((t) => t.id === tableId)) setTableId(tables[0]?.id || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])
  useEffect(() => {
    if (!rows.some((r) => r.id === recordId)) setRecordId(rows[0]?.id || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, rows.length])

  const record = rows.find((r) => r.id === recordId) || null
  const proxyStr = record && proxyField ? record.cells[proxyField.id] : ''
  const parsed = parseProxyString(proxyStr)
  const label = record ? rowLabel(table, record, rows.indexOf(record)) : 'Sessions VPN'
  const node = 'Sessions VPN' // stable Shadowrocket node name → silent swaps

  function connect() {
    if (!parsed) return
    window.location.href = shadowrocketLink(parsed, node)
  }

  async function copyLink() {
    if (!parsed) return
    try {
      await navigator.clipboard.writeText(shadowrocketLink(parsed, node))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked */ }
  }

  return (
    <div className="vpn">
      <div className="vpn-inner">
        <div className="vpn-head">
          <div className="vpn-badge"><Icon name="vpn" size={22} /></div>
          <div>
            <h1>VPN</h1>
            <p className="vpn-sub">Push a proxy exit into Shadowrocket in one tap.</p>
          </div>
        </div>

        <div className="vpn-fields">
          <label className="vpn-field">
            <span>Workspace</span>
            <div className="vpn-select">
              <select value={wsId || ''} onChange={(e) => setWsId(e.target.value)}>
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <Icon name="chevronDown" size={15} />
            </div>
          </label>

          <label className="vpn-field">
            <span>Tab sheet</span>
            <div className="vpn-select">
              <select value={tableId || ''} onChange={(e) => setTableId(e.target.value)}>
                {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <Icon name="chevronDown" size={15} />
            </div>
          </label>

          <label className="vpn-field">
            <span>Row</span>
            <div className="vpn-select">
              <select value={recordId || ''} onChange={(e) => setRecordId(e.target.value)} disabled={!rows.length}>
                {rows.length
                  ? rows.map((r, i) => <option key={r.id} value={r.id}>{rowLabel(table, r, i)}</option>)
                  : <option>No rows with a Proxy value</option>}
              </select>
              <Icon name="chevronDown" size={15} />
            </div>
          </label>
        </div>

        <div className={'vpn-card' + (parsed ? '' : ' empty')}>
          {parsed ? (
            <>
              <div className="vpn-exit-name">{label}</div>
              <div className="vpn-exit-meta">{proxyPreview(parsed)}</div>
              <button className="vpn-connect" onClick={connect}>
                <Icon name="power" size={22} />
                <span>Update Shadowrocket</span>
              </button>
              <button className="vpn-copy" onClick={copyLink}>
                {copied ? 'Copied link' : 'Copy Shadowrocket link'}
              </button>
              <p className="vpn-note">
                Node stays named <b>Sessions VPN</b>, so re-tapping just swaps the exit — keep it
                set as the global proxy in Shadowrocket and you never re-pick.
              </p>
            </>
          ) : (
            <div className="vpn-empty-note">
              {proxyField
                ? 'Pick a row that has a value in its Proxy column.'
                : 'This tab sheet has no “Proxy” column yet.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
