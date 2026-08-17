import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Managers' },
  { id: 'spaces', label: 'All spaces' },
  { id: 'settings', label: 'My TTLock' },
  { id: 'gateways', label: 'Gateways' },
  { id: 'activity', label: 'Activity' },
]

export default function AdminDashboard() {
  const { authenticated, loading: authLoading, logout, appName, isAdmin, refresh: refreshAuth } = useAuth()
  const [tab, setTab] = useState('overview')
  const [users, setUsers] = useState([])
  const [spaces, setSpaces] = useState([])
  const [logs, setLogs] = useState([])
  const [gateways, setGateways] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [flash, setFlash] = useState(null)
  const [error, setError] = useState('')
  const [gatewayError, setGatewayError] = useState('')
  const [ttlockForm, setTtlockForm] = useState({ username: '', password: '' })
  const [ttlockInfo, setTtlockInfo] = useState({ ttlockUsername: '', ttlockConfigured: false })
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const [usersRes, spacesRes, logsRes, dashRes, ttlockRes] = await Promise.all([
      api.listUsers(),
      api.listSpaces(),
      api.listLogs(100),
      api.dashboard(),
      api.getTtlock(),
    ])
    setUsers(usersRes.users || [])
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
    if (!authenticated || !isAdmin) return
    refresh().catch((err) => setError(err.message))
  }, [authenticated, isAdmin, refresh])

  if (authLoading) return <div className="page-loading">Loading…</div>
  if (!authenticated) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/manager" replace />

  const managers = users.filter((u) => u.role === 'manager')
  const pending = managers.filter((u) => u.status === 'pending')
  const stats = dashboard?.stats

  async function setStatus(user, action) {
    setBusy(true)
    setError('')
    setFlash(null)
    try {
      if (action === 'approve') await api.approveUser(user.id)
      if (action === 'reject') await api.rejectUser(user.id)
      if (action === 'disable') await api.disableUser(user.id)
      if (action === 'delete') {
        if (!window.confirm(`Delete manager "${user.username}"?`)) return
        await api.deleteUser(user.id)
      }
      setFlash(`Updated ${user.username}`)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveTtlock(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.saveTtlock(ttlockForm)
      setFlash('Admin TTLock account saved')
      setTtlockForm((prev) => ({ ...prev, password: '' }))
      await refreshAuth()
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-layout">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Administrator</p>
          <h1>{appName} control center</h1>
          <p className="lede">
            Approve parking managers, oversee spaces, and manage platform-wide activity.
          </p>
        </div>
        <div className="admin-header-actions">
          <Link className="btn btn-ghost" to="/">Customer keypad</Link>
          <button type="button" className="btn btn-ghost" onClick={() => logout()}>Sign out</button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id === 'users' && pending.length > 0 ? ` (${pending.length})` : ''}
          </button>
        ))}
      </div>

      {(error || flash) && <div className={`banner ${error ? 'error' : 'success'}`}>{error || flash}</div>}

      {tab === 'overview' && (
        <div className="overview-grid">
          <article className="stat-card">
            <span>Managers</span>
            <strong>{stats?.managers ?? managers.length}</strong>
            <em>{stats?.pendingManagers ?? pending.length} pending approval</em>
          </article>
          <article className="stat-card">
            <span>Spaces</span>
            <strong>{stats?.enabledSpaces ?? '—'} / {stats?.totalSpaces ?? '—'}</strong>
            <em>enabled / total</em>
          </article>
          <article className="stat-card">
            <span>Commands OK</span>
            <strong>{stats?.unlockSuccess ?? '—'}</strong>
            <em>failed {stats?.unlockFailed ?? 0}</em>
          </article>
          <article className="stat-card">
            <span>Hotels / bookings</span>
            <strong>{stats?.hotels ?? '—'} / {stats?.activeBookings ?? '—'}</strong>
            <em>properties / active PINs</em>
          </article>
        </div>
      )}

      {tab === 'users' && (
        <div className="panel table-panel">
          <div className="panel-head">
            <h2>Parking managers</h2>
            <button type="button" className="btn btn-ghost" onClick={() => refresh()}>Refresh</button>
          </div>
          {managers.length === 0 ? (
            <p className="empty">No manager registrations yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Company</th>
                    <th>PMS</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {managers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.displayName || user.username}</strong>
                        <div className="muted">@{user.username}{user.email ? ` · ${user.email}` : ''}</div>
                      </td>
                      <td>{user.companyName || '—'}</td>
                      <td>
                        <span className={`chip ${user.pmsConfigured ? 'on' : 'off'}`}>
                          {user.pmsConfigured ? (user.pmsTokenPreview || 'Connected') : 'Not connected'}
                        </span>
                      </td>
                      <td><span className={`chip ${user.status === 'approved' ? 'on' : 'off'}`}>{user.status}</span></td>
                      <td className="actions">
                        {user.status !== 'approved' && (
                          <button type="button" className="btn btn-small" disabled={busy} onClick={() => setStatus(user, 'approve')}>Approve</button>
                        )}
                        {user.status === 'pending' && (
                          <button type="button" className="btn btn-small" disabled={busy} onClick={() => setStatus(user, 'reject')}>Reject</button>
                        )}
                        {user.status === 'approved' && (
                          <button type="button" className="btn btn-small" disabled={busy} onClick={() => setStatus(user, 'disable')}>Disable</button>
                        )}
                        <button type="button" className="btn btn-small danger" disabled={busy} onClick={() => setStatus(user, 'delete')}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'spaces' && (
        <div className="panel table-panel">
          <div className="panel-head"><h2>All parking spaces</h2></div>
          {spaces.length === 0 ? <p className="empty">No spaces configured.</p> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Space</th><th>Hotel</th><th>Owner</th><th>lockId</th><th>PIN</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {spaces.map((space) => (
                    <tr key={space.id}>
                      <td><strong>{space.name}</strong></td>
                      <td>{space.hotelName || '—'}<div className="muted"><code>{space.hotelPublicId || '—'}</code></div></td>
                      <td className="muted">#{space.ownerId}</td>
                      <td><code>{space.lockId}</code></td>
                      <td><code>{space.pin || 'Available'}</code></td>
                      <td><span className={`chip ${space.enabled ? 'on' : 'off'}`}>{space.enabled ? 'Enabled' : 'Disabled'}</span></td>
                      <td className="actions">
                        <button type="button" className="btn btn-small" onClick={() => api.spaceCommand(space.id, 'unlock').then(() => setFlash(`Opened ${space.name}`)).catch((e) => setError(e.message))}>Open</button>
                        <button type="button" className="btn btn-small" onClick={() => api.spaceCommand(space.id, 'lock').then(() => setFlash(`Locked ${space.name}`)).catch((e) => setError(e.message))}>Lock</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <form className="panel form-panel settings-panel" onSubmit={saveTtlock}>
          <h2>Admin TTLock account (optional)</h2>
          <p className="lede tight">
            Managers each connect their own TTLock user. You can also save credentials here to browse gateways as admin.
          </p>
          <label>
            TTLock username
            <input value={ttlockForm.username} onChange={(e) => setTtlockForm({ ...ttlockForm, username: e.target.value })} required />
          </label>
          <label>
            TTLock password
            <input type="password" value={ttlockForm.password} onChange={(e) => setTtlockForm({ ...ttlockForm, password: e.target.value })} required />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : ttlockInfo.ttlockConfigured ? 'Update & verify' : 'Save & verify'}
          </button>
        </form>
      )}

      {tab === 'gateways' && (
        <div className="panel gateway-panel">
          <div className="panel-head">
            <h2>Gateways (admin TTLock account)</h2>
            <button type="button" className="btn btn-ghost" onClick={() => refresh()}>Refresh</button>
          </div>
          {gatewayError ? <div className="banner error">{gatewayError}</div> : null}
          {!gatewayError && gateways.length === 0 ? (
            <p className="empty">Connect TTLock credentials in My TTLock to browse gateways.</p>
          ) : (
            <div className="gateway-list">
              {gateways.map((g) => (
                <article key={g.gatewayId} className={`gateway-card ${g.isOnline ? 'online' : 'offline'}`}>
                  <header>
                    <div>
                      <strong>{g.gatewayName || g.gatewayId}</strong>
                      <div className="muted">{g.gatewayVersionLabel} · locks {g.lockNum}</div>
                    </div>
                    <span className={`chip ${g.isOnline ? 'on' : 'off'}`}>{g.isOnline ? 'Online' : 'Offline'}</span>
                  </header>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div className="panel log-panel">
          <div className="panel-head">
            <h2>Platform activity</h2>
            <button type="button" className="btn btn-ghost" onClick={async () => { if (window.confirm('Clear all logs?')) { await api.clearLogs(); await refresh() } }}>Clear</button>
          </div>
          {logs.length === 0 ? <p className="empty">No activity.</p> : (
            <div className="log-list">
              {logs.map((log) => (
                <article key={log.id} className={`log-item ${log.success ? 'ok' : 'fail'}`}>
                  <header>
                    <strong>{log.action}</strong>
                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                    <span className={`chip ${log.success ? 'on' : 'off'}`}>{log.success ? 'OK' : 'FAIL'}</span>
                  </header>
                  <p>owner #{log.ownerId || '—'} · {log.parkingSpaceName || '—'} · lockId {log.lockId || '—'}</p>
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
