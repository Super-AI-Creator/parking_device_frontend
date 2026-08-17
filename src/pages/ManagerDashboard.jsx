import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { useToasts } from '../Toasts.jsx'

const emptyForm = { hotelId: '', name: '', lockId: '', pin: '', notes: '', enabled: true }

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'pms', label: 'Beds24 PMS' },
  { id: 'hotels', label: 'Hotels' },
  { id: 'spaces', label: 'Spaces' },
  { id: 'gateways', label: 'Gateways' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'activity', label: 'Activity' },
]

export default function ManagerDashboard() {
  const { authenticated, loading: authLoading, logout, appName, user, isAdmin, refresh: refreshAuth } = useAuth()
  const { pushToast } = useToasts()
  const lastPinLogIdRef = useRef(null)
  const [tab, setTab] = useState('overview')
  const [spaces, setSpaces] = useState([])
  const [logs, setLogs] = useState([])
  const [hotels, setHotels] = useState([])
  const [bookings, setBookings] = useState([])
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
  const [pmsInfo, setPmsInfo] = useState({ pmsConfigured: false, pmsRefreshConfigured: false, pmsTokenPreview: '' })
  const [pmsForm, setPmsForm] = useState({ token: '', refreshToken: '', inviteCode: '' })
  const [pmsBusy, setPmsBusy] = useState(false)
  const [selectedHotelId, setSelectedHotelId] = useState('')
  const [hotelTtlock, setHotelTtlock] = useState({ username: '', password: '' })
  const [hotelTtlockBusy, setHotelTtlockBusy] = useState(false)

  const selectedHotel = hotels.find((hotel) => String(hotel.id) === String(selectedHotelId)) || null

  const notifyPinChanges = useCallback((logList) => {
    const pinLogs = (logList || []).filter(
      (log) => log.action === 'booking_assign' || log.action === 'booking_release',
    )
    const newest = pinLogs.reduce((max, log) => Math.max(max, Number(log.id) || 0), 0)
    if (lastPinLogIdRef.current == null) {
      lastPinLogIdRef.current = newest
      return
    }
    const fresh = pinLogs
      .filter((log) => Number(log.id) > lastPinLogIdRef.current)
      .sort((a, b) => Number(a.id) - Number(b.id))
    if (newest > lastPinLogIdRef.current) lastPinLogIdRef.current = newest

    for (const log of fresh) {
      const space = log.parkingSpaceName || 'a parking lock'
      const pin = log.pin ? `PIN ${log.pin}` : 'PIN'
      if (log.action === 'booking_assign' && log.success) {
        pushToast({
          type: 'success',
          title: 'New booking PIN',
          body: `${pin} was created on ${space}.`,
        })
      } else if (log.action === 'booking_assign') {
        pushToast({
          type: 'warning',
          title: 'Booking needs a lock',
          body: log.message || 'No available parking lock for this booking.',
        })
      } else if (log.action === 'booking_release') {
        pushToast({
          type: 'info',
          title: 'PIN removed',
          body: `${pin} was removed from ${space}. That lock is available again.`,
        })
      }
    }
  }, [pushToast])

  const refresh = useCallback(async () => {
    const [spacesRes, logsRes, dashRes, pmsRes, hotelsRes, bookingsRes] = await Promise.all([
      api.listSpaces(),
      api.listLogs(80),
      api.dashboard(),
      api.getPms(),
      api.listHotels(),
      api.listBookings(),
    ])
    setSpaces(spacesRes.spaces || [])
    setLogs(logsRes.logs || [])
    notifyPinChanges(logsRes.logs || [])
    setDashboard(dashRes)
    setPmsInfo(pmsRes)
    setHotels(hotelsRes.hotels || [])
    setBookings(bookingsRes.bookings || [])
    setSelectedHotelId((prev) => {
      if (prev && (hotelsRes.hotels || []).some((hotel) => String(hotel.id) === String(prev))) return prev
      return hotelsRes.hotels?.[0]?.id ? String(hotelsRes.hotels[0].id) : ''
    })
  }, [notifyPinChanges])

  useEffect(() => {
    if (!authenticated) return
    refresh().catch((err) => setError(err.message))
  }, [authenticated, refresh])

  useEffect(() => {
    if (!authenticated) return
    const timer = window.setInterval(() => {
      refresh().catch(() => {})
    }, 20000)
    return () => window.clearInterval(timer)
  }, [authenticated, refresh])

  useEffect(() => {
    if (!selectedHotelId) {
      setGateways([])
      setHotelTtlock({ username: '', password: '' })
      return
    }
    const hotel = hotels.find((item) => String(item.id) === String(selectedHotelId))
    setHotelTtlock({ username: hotel?.ttlockUsername || '', password: '' })
    if (!hotel?.ttlockConfigured) {
      setGateways([])
      setGatewayError('Save TTLock username and password for this hotel to load gateways.')
      return
    }
    api.listHotelGateways(selectedHotelId, true)
      .then((res) => {
        setGateways(res.gateways || [])
        setGatewayError('')
      })
      .catch((err) => {
        setGateways([])
        setGatewayError(err.message)
      })
  }, [selectedHotelId, hotels])

  if (authLoading) return <div className="page-loading">Loading…</div>
  if (!authenticated) return <Navigate to="/login" replace />
  if (isAdmin) return <Navigate to="/admin" replace />

  async function savePms(event) {
    event.preventDefault()
    setPmsBusy(true)
    setError('')
    setFlash(null)
    try {
      await api.savePms(pmsForm)
      setFlash('Beds24 connected. Hotels imported. Bookings will sync every minute without staying signed in.')
      setPmsForm({ token: '', refreshToken: '', inviteCode: '' })
      await refreshAuth()
      await refresh()
      setTab('hotels')
    } catch (err) {
      setError(err.message)
    } finally {
      setPmsBusy(false)
    }
  }

  async function clearPms() {
    if (!window.confirm('Remove Beds24 credentials from this account?')) return
    setPmsBusy(true)
    try {
      await api.savePms({ clear: true })
      setFlash('Beds24 credentials cleared')
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setPmsBusy(false)
    }
  }

  async function runHotelSync() {
    setPmsBusy(true)
    setError('')
    try {
      const res = await api.syncHotels()
      setFlash(`Imported ${res.count} hotel(s) from Beds24`)
      await refresh()
      setTab('hotels')
    } catch (err) {
      setError(err.message)
    } finally {
      setPmsBusy(false)
    }
  }

  async function runBookingSync() {
    setPmsBusy(true)
    setError('')
    try {
      const res = await api.syncBookings()
      setFlash(`Booking sync: assigned ${res.assigned || 0}, released ${res.released || 0}`)
      await refresh()
      setTab('bookings')
    } catch (err) {
      setError(err.message)
    } finally {
      setPmsBusy(false)
    }
  }

  async function saveHotelTtlock(event) {
    event.preventDefault()
    if (!selectedHotelId) return
    setHotelTtlockBusy(true)
    setError('')
    setFlash(null)
    try {
      await api.saveHotelTtlock(selectedHotelId, hotelTtlock)
      setFlash(`TTLock connected for ${selectedHotel?.name || 'hotel'}. Gateways will load from this account.`)
      setHotelTtlock((prev) => ({ ...prev, password: '' }))
      await refresh()
      setTab('gateways')
    } catch (err) {
      setError(err.message)
    } finally {
      setHotelTtlockBusy(false)
    }
  }

  async function clearHotelTtlock() {
    if (!selectedHotelId) return
    if (!window.confirm('Remove TTLock credentials from this hotel?')) return
    setHotelTtlockBusy(true)
    try {
      await api.saveHotelTtlock(selectedHotelId, { clear: true })
      setFlash('Hotel TTLock credentials cleared')
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setHotelTtlockBusy(false)
    }
  }

  async function saveSpace(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setFlash(null)
    try {
      const payload = {
        hotelId: Number(form.hotelId),
        name: form.name.trim(),
        lockId: String(form.lockId).trim(),
        pin: String(form.pin || '').trim(),
        notes: form.notes.trim(),
        enabled: form.enabled,
      }
      if (editingId) {
        await api.updateSpace(editingId, payload)
        setFlash(payload.pin ? 'Parking space updated with manual PIN' : 'Parking space updated')
      } else {
        await api.createSpace(payload)
        setFlash(
          payload.pin
            ? 'Parking space added with a manual PIN. Bookings will not use this lock until the PIN is cleared.'
            : 'Parking space added. Bookings can assign a PIN to this lock, or you can set one manually.',
        )
      }
      setEditingId(null)
      setForm({ ...emptyForm, hotelId: form.hotelId })
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
            Connect Beds24, import hotels, attach a TTLock account per hotel, and let bookings assign parking PINs.
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
            <span>Hotels</span>
            <strong>{stats?.hotels ?? '—'}</strong>
            <em>{dashboard?.gateways?.hotelsWithTtlock ?? 0} with TTLock</em>
          </article>
          <article className="stat-card">
            <span>Spaces</span>
            <strong>{stats?.freeSpaces ?? '—'} / {stats?.totalSpaces ?? '—'}</strong>
            <em>available / total</em>
          </article>
          <article className="stat-card">
            <span>Active bookings</span>
            <strong>{stats?.activeBookings ?? '—'}</strong>
            <em>PIN assigned from Beds24</em>
          </article>
          <article className="stat-card">
            <span>Beds24</span>
            <strong>{pmsInfo.pmsConfigured ? 'Connected' : 'Not set'}</strong>
            <em>{pmsInfo.pmsRefreshConfigured ? 'Token auto-renews' : (pmsInfo.pmsTokenPreview || 'Add invite code')}</em>
          </article>
        </div>
      )}

      {tab === 'pms' && (
        <form className="panel form-panel settings-panel" onSubmit={savePms}>
          <h2>Beds24 PMS</h2>
          <p className="lede tight">
            Connect once. ParkAccess keeps the token fresh and checks bookings every minute, even if nobody is signed in.
            Use a Beds24 invite code (recommended) or paste both the access token and refresh token from
            {' '}<a href="https://beds24.com/api/v2" target="_blank" rel="noreferrer">Beds24 API v2</a>.
          </p>
          {pmsInfo.pmsConfigured && (
            <p className="muted">
              Connected token: {pmsInfo.pmsTokenPreview}
              {pmsInfo.pmsRefreshConfigured ? ' · auto-renew enabled' : ' · refresh token missing — bookings will stop when this token expires'}
            </p>
          )}
          <label>
            Invite code (recommended)
            <input
              value={pmsForm.inviteCode}
              onChange={(e) => setPmsForm({ ...pmsForm, inviteCode: e.target.value })}
              placeholder="Beds24 setup invite code"
            />
          </label>
          <label>
            Access token
            <input
              value={pmsForm.token}
              onChange={(e) => setPmsForm({ ...pmsForm, token: e.target.value })}
              placeholder={pmsInfo.pmsConfigured ? 'Enter to replace' : 'If you are not using an invite code'}
            />
          </label>
          <label>
            Refresh token
            <input
              value={pmsForm.refreshToken}
              onChange={(e) => setPmsForm({ ...pmsForm, refreshToken: e.target.value })}
              placeholder="Required with access token so it can auto-renew"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={pmsBusy}>
              {pmsBusy ? 'Saving…' : 'Save PMS'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={runHotelSync} disabled={pmsBusy || !pmsInfo.pmsConfigured}>
              Sync hotels
            </button>
            <button type="button" className="btn btn-ghost" onClick={runBookingSync} disabled={pmsBusy || !pmsInfo.pmsConfigured}>
              Sync bookings now
            </button>
            {pmsInfo.pmsConfigured && (
              <button type="button" className="btn btn-ghost" onClick={clearPms} disabled={pmsBusy}>
                Clear
              </button>
            )}
          </div>
        </form>
      )}

      {tab === 'hotels' && (
        <div className="admin-grid">
          <form className="panel form-panel" onSubmit={saveHotelTtlock}>
            <h2>Hotel TTLock account</h2>
            <p className="lede tight">Each hotel uses its own TTLock username and password. Gateways are listed from that account.</p>
            <label>
              Hotel
              <select
                value={selectedHotelId}
                onChange={(e) => setSelectedHotelId(e.target.value)}
                required
              >
                <option value="">Select hotel</option>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name} (ID {hotel.hotelId})
                  </option>
                ))}
              </select>
            </label>
            {selectedHotel && (
              <p className="muted">
                Customer keypad hotel ID: <code>{selectedHotel.hotelId}</code>
                {' · '}
                {selectedHotel.availableSpaces}/{selectedHotel.spaceCount} spaces free
              </p>
            )}
            <label>
              TTLock username
              <input
                value={hotelTtlock.username}
                onChange={(e) => setHotelTtlock({ ...hotelTtlock, username: e.target.value })}
                placeholder="TTLock account email or phone"
                required
              />
            </label>
            <label>
              TTLock password
              <input
                type="password"
                value={hotelTtlock.password}
                onChange={(e) => setHotelTtlock({ ...hotelTtlock, password: e.target.value })}
                placeholder={selectedHotel?.ttlockConfigured ? 'Enter to update' : 'Required'}
                required
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={hotelTtlockBusy || !selectedHotelId}>
                {hotelTtlockBusy ? 'Verifying…' : 'Save & verify'}
              </button>
              {selectedHotel?.ttlockConfigured && (
                <button type="button" className="btn btn-ghost" onClick={clearHotelTtlock} disabled={hotelTtlockBusy}>
                  Clear
                </button>
              )}
            </div>
          </form>

          <div className="panel table-panel">
            <div className="panel-head">
              <h2>Hotels from Beds24</h2>
              <button type="button" className="btn btn-ghost" onClick={runHotelSync} disabled={pmsBusy}>
                Refresh from PMS
              </button>
            </div>
            {hotels.length === 0 ? (
              <p className="empty">No hotels yet. Connect Beds24 and sync hotels.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Hotel</th>
                      <th>Hotel ID</th>
                      <th>TTLock</th>
                      <th>Spaces</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hotels.map((hotel) => (
                      <tr key={hotel.id}>
                        <td><strong>{hotel.name}</strong></td>
                        <td><code>{hotel.hotelId}</code></td>
                        <td>
                          <span className={`chip ${hotel.ttlockConfigured ? 'on' : 'off'}`}>
                            {hotel.ttlockConfigured ? hotel.ttlockUsername : 'Not set'}
                          </span>
                        </td>
                        <td>{hotel.availableSpaces} free / {hotel.spaceCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'spaces' && (
        <div className="admin-grid">
          <form className="panel form-panel" onSubmit={saveSpace}>
            <h2>{editingId ? 'Edit space' : 'Add parking space'}</h2>
            <label>
              Hotel
              <select
                value={form.hotelId}
                onChange={(e) => setForm({ ...form, hotelId: e.target.value })}
                required
              >
                <option value="">Select hotel</option>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name} (ID {hotel.hotelId})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Space name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              TTLock lockId
              <input value={form.lockId} onChange={(e) => setForm({ ...form, lockId: e.target.value })} required />
            </label>
            <label>
              Manual PIN (optional)
              <input
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                inputMode="numeric"
                maxLength={6}
                placeholder="Leave empty for booking auto-assign"
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
            <p className="muted">
              Leave PIN empty so Beds24 bookings can use this lock. A 6-digit manual PIN occupies the lock until you clear it.
            </p>
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
              <p className="empty">No spaces yet. Assign lockIds from Gateways after connecting hotel TTLock.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Space</th>
                      <th>Hotel</th>
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
                        <td>{space.hotelName || '—'}<div className="muted"><code>{space.hotelPublicId}</code></div></td>
                        <td><code>{space.lockId}</code></td>
                        <td><code>{space.pin ? (showPins ? space.pin : '••••••') : 'Available'}</code></td>
                        <td><span className={`chip ${space.enabled ? 'on' : 'off'}`}>{space.bookingId ? `Booking ${space.bookingId}` : (space.enabled ? 'Free' : 'Disabled')}</span></td>
                        <td className="actions">
                          <button type="button" className="btn btn-small" disabled={busyId} onClick={() => runCommand(space, 'unlock')}>Open</button>
                          <button type="button" className="btn btn-small" disabled={busyId} onClick={() => runCommand(space, 'lock')}>Lock</button>
                          <button type="button" className="btn btn-small" onClick={() => { setEditingId(space.id); setForm({ hotelId: space.hotelId ? String(space.hotelId) : '', name: space.name, lockId: space.lockId, pin: space.pin || '', notes: space.notes || '', enabled: space.enabled }) }}>Edit</button>
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
              <h2>Hotel TTLock gateways</h2>
              <p className="lede tight">Gateways come from the TTLock account saved on the selected hotel.</p>
            </div>
            <div className="form-actions">
              <select value={selectedHotelId} onChange={(e) => setSelectedHotelId(e.target.value)}>
                <option value="">Select hotel</option>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name} (ID {hotel.hotelId})
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost" onClick={() => refresh()}>Refresh</button>
            </div>
          </div>
          {gatewayError ? <div className="banner error">{gatewayError}</div> : null}
          {!gatewayError && gateways.length === 0 ? (
            <p className="empty">No gateways found for this hotel.</p>
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
                                      hotelId: selectedHotelId || prev.hotelId,
                                      name: prev.name || lock.lockAlias || lock.lockName || `Lock ${lock.lockId}`,
                                      lockId: String(lock.lockId),
                                    }))
                                    setTab('spaces')
                                    setFlash(`lockId ${lock.lockId} ready — save it as a parking space for this hotel`)
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

      {tab === 'bookings' && (
        <div className="panel table-panel">
          <div className="panel-head">
            <div>
              <h2>Bookings</h2>
              <p className="lede tight">Synced from Beds24 every minute. PIN = last 6 digits of booking ID.</p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={runBookingSync} disabled={pmsBusy}>
              Sync now
            </button>
          </div>
          {bookings.length === 0 ? (
            <p className="empty">No bookings yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Guest</th>
                    <th>Hotel</th>
                    <th>Stay</th>
                    <th>PIN</th>
                    <th>Space</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td><code>{booking.bookingId}</code></td>
                      <td>{booking.guestName || '—'}</td>
                      <td>{booking.hotelName}<div className="muted"><code>{booking.hotelPublicId}</code></div></td>
                      <td>{booking.arrival || '—'} → {booking.departure || '—'}</td>
                      <td><code>{booking.pin || '—'}</code></td>
                      <td>{booking.parkingSpaceName || '—'}</td>
                      <td><span className={`chip ${booking.status === 'active' ? 'on' : 'off'}`}>{booking.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
