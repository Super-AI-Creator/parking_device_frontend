import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'

const emptyForm = { name: '', lockId: '', pin: '', notes: '', enabled: true }

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'settings', label: 'TTLock account' },
  { id: 'spaces', label: 'Spaces' },
  { id: 'gateways', label: 'Gateways' },
  { id: 'activity', label: 'Activity' },
]

export default function ManagerDashboard() {
  const { authenticated, loading: authLoading, logout, appName, user, isAdmin, refresh: refreshAuth } = useAuth()
  const [tab, setTab] = useState('overview')
  const [spaces, setSpaces] = useState([])
  const [logs, setLogs] = useState([])
  const [gateways, setGateways] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState(null)
  const [error, setError] = useState('')
  const [gatewayError, setGatewayError] = useState('')
  const [showPins, setShowPins] = useState(false)
  const [ttlockForm, setTtlockForm] = useState({ username: '', password: '' })
  const [ttlockInfo, setTtlockInfo] = useState({ ttlockUsername: '', ttlockConfigured: false })
  const [ttlockBusy, setTtlockBusy] = useState(false)

  const refresh = useCallback(async () => {
    const [spacesRes, logsRes, dashRes, ttlockRes] = await Promise.all([
      api.listSpaces(),
      api.listLogs(80),
      api.dashboard(),
      api.getTtlock(),
    ])
    setSpaces(spacesRes.spaces || [])
    setLogs(logsRes.logs || [])
    setDashboard(dashRes)
    setTtlockInfo(ttlockRes)
    setTtlockForm((prev) => ({ ...prev, username: ttlockRes.ttlockUsername || '' }))

    try {
      const gatewayRes = await api.listGateways(true)
      setGateways(gatewayRes.gateways || [])
      setGatewayError('')
    } catch (err) {
      setGateways([])
      setGatewayError(err.message)
    }
  }, [])

  useEffect(() => {
    if (!authenticated) return
    refresh().catch((err) => setError(err.message))
  }, [authenticated, refresh])

  if (authLoading) return <div className="page-loading">Loading…</div>
  if (!authenticated) return <Navigate to="/login" replace />
  if (isAdmin) return <Navigate to="/admin" replace />

  async function saveTtlock(event) {
    event.preventDefault()
    setTtlockBusy(true)
    setError('')
    setFlash(null)
    try {
      await api.saveTtlock(ttlockForm)
      setFlash('TTLock account connected. Gateways will load from this region account.')
      setTtlockForm((prev) => ({ ...prev, password: '' }))
      await refreshAuth()
      await refresh()
      setTab('gateways')
    } catch (err) {
      setError(err.message)
    } finally {
      setTtlockBusy(false)
    }
  }

  async function clearTtlock() {
    if (!window.confirm('Remove TTLock credentials from this account?')) return
    setTtlockBusy(true)
    try {
      await api.saveTtlock({ clear: true })
      setFlash('TTLock credentials cleared')
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setTtlockBusy(false)
    }
  }

  async function saveSpace(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setFlash(null)
    try {
      const payload = {
        name: form.name.trim(),
        lockId: String(form.lockId).trim(),
        pin: String(form.pin).trim(),
        notes: form.notes.trim(),
        enabled: form.enabled,
      }
      if (editingId) {
        await api.updateSpace(editingId, payload)
        setFlash('Parking space updated')
      } else {
        await api.createSpace(payload)
        setFlash('Parking space added')
      }
      setEditingId(null)
      setForm(emptyForm)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function runCommand(space, action) {
    setBusyId(`${space.id}-${action}`)
    setError('')
    setFlash(null)
    try {
      await api.spaceCommand(space.id, action)
      setFlash(`${action === 'unlock' ? 'Opened' : 'Locked'} ${space.name}`)
      await refresh()
    } catch (err) {
      setError(`${space.name}: ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  const stats = dashboard?.stats

  return (
    <section className="admin-layout">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Parking manager</p>
          <h1>{user?.companyName || user?.displayName || user?.username}</h1>
          <p className="lede">
            Connect your TTLock account, import locks from your G2 gateways, and issue customer PINs.
          </p>
        </div>
        <div className="admin-header-actions">
          <Link className="btn btn-ghost" to="/">{appName} keypad</Link>
          <button type="button" className="btn btn-ghost" onClick={() => logout()}>Sign out</button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {(error || flash) && <div className={`banner ${error ? 'error' : 'success'}`}>{error || flash}</div>}

      {tab === 'overview' && (
        <div className="overview-grid">
          <article className="stat-card">
            <span>Spaces</span>
            <strong>{stats?.enabledSpaces ?? '—'} / {stats?.totalSpaces ?? '—'}</strong>
            <em>enabled / total</em>
          </article>
          <article className="stat-card">
            <span>TTLock</span>
            <strong>{ttlockInfo.ttlockConfigured ? 'Connected' : 'Not set'}</strong>
            <em>{ttlockInfo.ttlockUsername || 'Add credentials'}</em>
          </article>
          <article className="stat-card">
            <span>Gateways</span>
            <strong>{dashboard?.gateways?.online ?? '—'} / {dashboard?.gateways?.count ?? '—'}</strong>
            <em>online / total</em>
          </article>
          <article className="stat-card">
            <span>Commands OK</span>
            <strong>{stats?.unlockSuccess ?? '—'}</strong>
            <em>failed {stats?.unlockFailed ?? 0}</em>
          </article>
        </div>
      )}

      {tab === 'settings' && (
        <form className="panel form-panel settings-panel" onSubmit={saveTtlock}>
          <h2>TTLock region account</h2>
          <p className="lede tight">
            Use the TTLock app username and password for the account that owns your G2 gateways.
            ParkAccess never sends these credentials to the browser after save.
          </p>
          <label>
            TTLock username
            <input
              value={ttlockForm.username}
              onChange={(e) => setTtlockForm({ ...ttlockForm, username: e.target.value })}
              placeholder="email or phone"
              required
            />
          </label>
          <label>
            TTLock password
            <input
              type="password"
              value={ttlockForm.password}
              onChange={(e) => setTtlockForm({ ...ttlockForm, password: e.target.value })}
              placeholder={ttlockInfo.ttlockConfigured ? 'Enter to update' : 'Required'}
              required
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={ttlockBusy}>
              {ttlockBusy ? 'Verifying…' : 'Save & verify'}
            </button>
            {ttlockInfo.ttlockConfigured && (
              <button type="button" className="btn btn-ghost" onClick={clearTtlock} disabled={ttlockBusy}>
                Clear
              </button>
            )}
          </div>
        </form>
      )}

      {tab === 'spaces' && (
        <div className="admin-grid">
          <form className="panel form-panel" onSubmit={saveSpace}>
            <h2>{editingId ? 'Edit space' : 'Add parking space'}</h2>
            <label>
              Space name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              TTLock lockId
              <input value={form.lockId} onChange={(e) => setForm({ ...form, lockId: e.target.value })} required />
            </label>
            <label>
              Customer PIN
              <input
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
                inputMode="numeric"
                minLength={4}
                required
              />
            </label>
            <label>
              Notes
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              Enabled
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Update' : 'Add space'}
              </button>
              {editingId && (
                <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setForm(emptyForm) }}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="panel table-panel">
            <div className="panel-head">
              <h2>Your spaces</h2>
              <label className="checkbox compact">
                <input type="checkbox" checked={showPins} onChange={(e) => setShowPins(e.target.checked)} />
                Show PINs
              </label>
            </div>
            {spaces.length === 0 ? (
              <p className="empty">No spaces yet. Assign lockIds from Gateways.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Space</th>
                      <th>lockId</th>
                      <th>PIN</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spaces.map((space) => (
                      <tr key={space.id}>
                        <td><strong>{space.name}</strong></td>
                        <td><code>{space.lockId}</code></td>
                        <td><code>{showPins ? space.pin : '••••'}</code></td>
                        <td><span className={`chip ${space.enabled ? 'on' : 'off'}`}>{space.enabled ? 'Enabled' : 'Disabled'}</span></td>
                        <td className="actions">
                          <button type="button" className="btn btn-small" disabled={busyId} onClick={() => runCommand(space, 'unlock')}>Open</button>
                          <button type="button" className="btn btn-small" disabled={busyId} onClick={() => runCommand(space, 'lock')}>Lock</button>
                          <button type="button" className="btn btn-small" onClick={() => { setEditingId(space.id); setForm({ name: space.name, lockId: space.lockId, pin: space.pin, notes: space.notes || '', enabled: space.enabled }) }}>Edit</button>
                          <button type="button" className="btn btn-small danger" onClick={async () => { if (window.confirm(`Delete ${space.name}?`)) { await api.deleteSpace(space.id); await refresh() } }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'gateways' && (
        <div className="panel gateway-panel">
          <div className="panel-head">
            <div>
              <h2>Your TTLock gateways</h2>
              <p className="lede tight">Loaded with the TTLock account you saved in Settings.</p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => refresh()}>Refresh</button>
          </div>
          {gatewayError ? <div className="banner error">{gatewayError}</div> : null}
          {!gatewayError && gateways.length === 0 ? (
            <p className="empty">No gateways found. Connect TTLock credentials first.</p>
          ) : (
            <div className="gateway-list">
              {gateways.map((gateway) => (
                <article key={gateway.gatewayId} className={`gateway-card ${gateway.isOnline ? 'online' : 'offline'}`}>
                  <header>
                    <div>
                      <strong>{gateway.gatewayName || `Gateway ${gateway.gatewayId}`}</strong>
                      <div className="muted">{gateway.gatewayVersionLabel} · {gateway.networkName || '—'}</div>
                    </div>
                    <span className={`chip ${gateway.isOnline ? 'on' : 'off'}`}>{gateway.isOnline ? 'Online' : 'Offline'}</span>
                  </header>
                  {(gateway.locks || []).length > 0 && (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>Lock</th><th>lockId</th><th>RSSI</th><th></th></tr>
                        </thead>
                        <tbody>
                          {gateway.locks.map((lock) => (
                            <tr key={lock.lockId}>
                              <td><strong>{lock.lockAlias || lock.lockName}</strong></td>
                              <td><code>{lock.lockId}</code></td>
                              <td>{lock.rssi ?? '—'}</td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-small"
                                  onClick={() => {
                                    setForm((prev) => ({
                                      ...prev,
                                      name: prev.name || lock.lockAlias || lock.lockName || `Lock ${lock.lockId}`,
                                      lockId: String(lock.lockId),
                                    }))
                                    setTab('spaces')
                                    setFlash(`lockId ${lock.lockId} ready — set a PIN and save`)
                                  }}
                                >
                                  Assign space
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div className="panel log-panel">
          <div className="panel-head">
            <h2>Activity</h2>
            <button type="button" className="btn btn-ghost" onClick={async () => { if (window.confirm('Clear logs?')) { await api.clearLogs(); await refresh() } }}>Clear</button>
          </div>
          {logs.length === 0 ? <p className="empty">No activity yet.</p> : (
            <div className="log-list">
              {logs.map((log) => (
                <article key={log.id} className={`log-item ${log.success ? 'ok' : 'fail'}`}>
                  <header>
                    <strong>{log.action}</strong>
                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                    <span className={`chip ${log.success ? 'on' : 'off'}`}>{log.success ? 'OK' : 'FAIL'}</span>
                  </header>
                  <p>{log.parkingSpaceName || '—'} · lockId {log.lockId || '—'}</p>
                  <p className="muted">{log.message}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
