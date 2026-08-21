import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { useToasts } from '../Toasts.jsx'

const emptyForm = { hotelId: '', name: '', lockId: '', pin: '', notes: '', enabled: true }

function normalizeLockId(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  // HHS Lock may send numbers; DB stores strings — compare on digits only.
  const digits = raw.replace(/\D/g, '')
  return digits || raw
}

function mergeHotelSpaces(current, hotelId, hotelSpaces) {
  const others = (current || []).filter((space) => String(space.hotelId) !== String(hotelId))
  return [...others, ...(hotelSpaces || [])]
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'pms', label: 'HHS PMS' },
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
  const [pinModeBusy, setPinModeBusy] = useState(false)

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
      setGatewayError('Save HHS Lock username and password for this hotel to load gateways.')
      return
    }
    let cancelled = false
    api.listHotelGateways(selectedHotelId, true)
      .then((res) => {
        if (cancelled) return
        setGateways(res.gateways || [])
        // Prefer DB spaces from the response — lockSync.spaces can be a stale empty-PIN snapshot.
        const linked = res.spaces || res.lockSync?.spaces || []
        setSpaces((prev) => mergeHotelSpaces(prev, selectedHotelId, linked))
        if (res.lockSync?.errors?.length) {
          setGatewayError(res.lockSync.errors.map((item) => `lock ${item.lockId}: ${item.error}`).join(' · '))
        } else {
          setGatewayError('')
        }
        if (res.lockSync?.added > 0) {
          pushToast({
            type: 'success',
            title: 'Parking locks imported',
            body: `${res.lockSync.added} HHS Lock device(s) are now available for bookings.`,
          })
        }
      })
      .catch((err) => {
        if (cancelled) return
        setGateways([])
        setGatewayError(err.message)
      })
    return () => {
      cancelled = true
    }
  // Only re-import when the selected hotel or its HHS Lock connection changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHotelId, selectedHotel?.ttlockConfigured, selectedHotel?.ttlockUsername, pushToast])

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
      setFlash('HHS PMS connected. Hotels imported. Bookings will sync every 3 minutes without staying signed in.')
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
    if (!window.confirm('Remove HHS PMS credentials from this account?')) return
    setPmsBusy(true)
    try {
      await api.savePms({ clear: true })
      setFlash('HHS PMS credentials cleared')
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
      setFlash(`Imported ${res.count} hotel(s) from HHS PMS`)
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
      const res = await api.saveHotelTtlock(selectedHotelId, hotelTtlock)
      setFlash(res.message || `HHS Lock connected for ${selectedHotel?.name || 'hotel'}. Parking locks are imported automatically.`)
      setHotelTtlock((prev) => ({ ...prev, password: '' }))
      await refresh()
      setTab('spaces')
    } catch (err) {
      setError(err.message)
    } finally {
      setHotelTtlockBusy(false)
    }
  }

  async function clearHotelTtlock() {
    if (!selectedHotelId) return
    if (!window.confirm('Remove HHS Lock credentials from this hotel?')) return
    setHotelTtlockBusy(true)
    try {
      await api.saveHotelTtlock(selectedHotelId, { clear: true })
      setFlash('Hotel HHS Lock credentials cleared')
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setHotelTtlockBusy(false)
    }
  }

  async function saveHotelPinMode(mode) {
    if (!selectedHotelId) return
    setPinModeBusy(true)
    setError('')
    setFlash(null)
    try {
      const res = await api.saveHotelPinMode(selectedHotelId, mode)
      setFlash(res.message || `PIN assignment set to ${mode} mode.`)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setPinModeBusy(false)
    }
  }

  async function saveSpace(event) {
    event.preventDefault()
    if (!editingId) {
      setError('Select an available parking space first.')
      return
    }
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
      await api.updateSpace(editingId, payload)
      setFlash(
        payload.pin
          ? `Manual PIN ${payload.pin} saved on ${form.name || 'this parking lock'}.`
          : `${form.name || 'Parking lock'} is free again for booking auto-assign.`,
      )
      setEditingId(null)
      setForm({ ...emptyForm, hotelId: form.hotelId })
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeSpace(space) {
    if (!window.confirm(`Free ${space.name}? The PIN will be removed from the HHS Lock and this lock becomes Available.`)) {
      return
    }
    setBusyId(`delete-${space.id}`)
    setError('')
    setFlash(null)
    setSpaces((prev) =>
      prev.map((item) =>
        item.id === space.id
          ? { ...item, pin: '', bookingId: null, keyboardPwdId: null }
          : item,
      ),
    )
    try {
      const res = await api.deleteSpace(space.id)
      if (res.spaces) {
        setSpaces((prev) => mergeHotelSpaces(prev, space.hotelId, res.spaces))
      } else if (res.space) {
        setSpaces((prev) => prev.map((item) => (item.id === res.space.id ? res.space : item)))
      }
      setFlash(res.message || `${space.name} is Available again.`)
      pushToast({
        type: 'info',
        title: 'Parking lock freed',
        body: res.message || `${space.name} is Available again.`,
      })
      refresh().catch(() => {})
    } catch (err) {
      setError(err.message)
      await refresh().catch(() => {})
    } finally {
      setBusyId(null)
    }
  }

  async function refreshGateways() {
    setError('')
    if (!selectedHotelId) {
      await refresh()
      return
    }
    try {
      const gatewayRes = await api.listHotelGateways(selectedHotelId, true)
      setGateways(gatewayRes.gateways || [])
      const linked = gatewayRes.spaces || gatewayRes.lockSync?.spaces || []
      setSpaces((prev) => mergeHotelSpaces(prev, selectedHotelId, linked))
      setGatewayError(
        gatewayRes.lockSync?.errors?.length
          ? gatewayRes.lockSync.errors.map((item) => `lock ${item.lockId}: ${item.error}`).join(' · ')
          : '',
      )
      // refresh() is source of truth for pins; only add locks refresh raced before insert.
      await refresh()
      if (linked.length) {
        setSpaces((prev) => {
          const hotelId = selectedHotelId
          const others = prev.filter((s) => String(s.hotelId) !== String(hotelId))
          const forHotel = prev.filter((s) => String(s.hotelId) === String(hotelId))
          const merged = [...forHotel]
          for (const space of linked) {
            const key = normalizeLockId(space.lockId)
            if (key && !merged.some((s) => normalizeLockId(s.lockId) === key)) {
              merged.push(space)
            }
          }
          return [...others, ...merged]
        })
      }
    } catch (err) {
      setGatewayError(err.message)
    }
  }

  async function runCommand(space, action) {
    setBusyId(`${space.id}-${action}`)
    setError('')
    setFlash(null)
    try {
      await api.spaceCommand(space.id, action)
      setFlash(`${action === 'unlock' ? 'Opened' : 'Locked'} ${space.name}`)
      refresh().catch(() => {})
    } catch (err) {
      setError(`${space.name}: ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  function spaceBusy(space) {
    return busyId === `delete-${space.id}` || busyId?.startsWith(`${space.id}-`)
  }

  const stats = dashboard?.stats
  const spaceByLockId = new Map(
    spaces.map((space) => [normalizeLockId(space.lockId), space]).filter(([id]) => id),
  )
  const selectableSpaces = spaces.filter((space) => {
    const hotelPk = String(form.hotelId || '')
    const spaceHotel = String(space.hotelId ?? '')
    const spacePublic = String(space.hotelPublicId ?? '')
    const selectedHotel = hotels.find((item) => String(item.id) === hotelPk)
    if (hotelPk) {
      const matchesPk = spaceHotel === hotelPk
      const matchesPublic = selectedHotel && spacePublic && spacePublic === String(selectedHotel.hotelId)
      if (!matchesPk && !matchesPublic) return false
    }
    if (editingId && String(space.id) === String(editingId)) return true
    return !String(space.pin || '').trim()
  })

  return (
    <section className="admin-layout">
      <div className="admin-header">
        <div>
          <p className="eyebrow">Parking manager</p>
          <h1>{user?.companyName || user?.displayName || user?.username}</h1>
          <p className="lede">
            Connect HHS PMS, import hotels, attach an HHS Lock account per hotel, and let bookings assign parking PINs.
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
            <em>{dashboard?.gateways?.hotelsWithTtlock ?? 0} with HHS Lock</em>
          </article>
          <article className="stat-card">
            <span>Spaces</span>
            <strong>{stats?.freeSpaces ?? '—'} / {stats?.totalSpaces ?? '—'}</strong>
            <em>available / total</em>
          </article>
          <article className="stat-card">
            <span>Active bookings</span>
            <strong>{stats?.activeBookings ?? '—'}</strong>
            <em>PIN assigned from HHS PMS</em>
          </article>
          <article className="stat-card">
            <span>HHS PMS</span>
            <strong>{pmsInfo.pmsConfigured ? 'Connected' : 'Not set'}</strong>
            <em>{pmsInfo.pmsRefreshConfigured ? 'Token auto-renews' : (pmsInfo.pmsTokenPreview || 'Add invite code')}</em>
          </article>
        </div>
      )}

      {tab === 'pms' && (
        <form className="panel form-panel settings-panel" onSubmit={savePms}>
          <h2>HHS PMS</h2>
          <p className="lede tight">
            Connect once. ParkAccess keeps the token fresh and checks bookings every 3 minutes, even if nobody is signed in.
            Use an HHS PMS invite code (recommended) or paste both the access token and refresh token from
            {' '}<a href="https://beds24.com/api/v2" target="_blank" rel="noreferrer">HHS PMS API</a>.
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
              placeholder="HHS PMS setup invite code"
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
            <h2>Hotel HHS Lock account</h2>
            <p className="lede tight">Each hotel uses its own HHS Lock username and password. Gateways are listed from that account.</p>
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
            {selectedHotel?.blocked && (
              <div className="banner error">This hotel is blocked by admin. Customer keypad and new PIN assignment are stopped.</div>
            )}
            {selectedHotel && (
              <fieldset className="radio-group" disabled={pinModeBusy || !selectedHotelId}>
                <legend>PIN assignment</legend>
                <label className="checkbox">
                  <input
                    type="radio"
                    name="pinAssignMode"
                    checked={(selectedHotel.pinAssignMode || 'random') === 'random'}
                    onChange={() => saveHotelPinMode('random')}
                  />
                  Random mode
                </label>
                <p className="radio-help">PIN is written to any one free HHS Lock at this hotel.</p>
                <label className="checkbox">
                  <input
                    type="radio"
                    name="pinAssignMode"
                    checked={selectedHotel.pinAssignMode === 'auto'}
                    onChange={() => saveHotelPinMode('auto')}
                  />
                  Auto mode
                </label>
                <p className="radio-help">
                  PIN is written to the HHS Lock whose name matches parking text in the booking JSON (for example Park 1).
                  If the booking has no parking text, no PIN is created. If the matched lock is occupied or missing, the booking stays unassigned.
                </p>
              </fieldset>
            )}
            <label>
              HHS Lock username
              <input
                value={hotelTtlock.username}
                onChange={(e) => setHotelTtlock({ ...hotelTtlock, username: e.target.value })}
                placeholder="HHS Lock account email or phone"
                required
              />
            </label>
            <label>
              HHS Lock password
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
              <h2>Hotels from HHS PMS</h2>
              <button type="button" className="btn btn-ghost" onClick={runHotelSync} disabled={pmsBusy}>
                Refresh from PMS
              </button>
            </div>
            {hotels.length === 0 ? (
              <p className="empty">No hotels yet. Connect HHS PMS and sync hotels.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Hotel</th>
                      <th>Hotel ID</th>
                      <th>HHS Lock</th>
                      <th>PIN mode</th>
                      <th>Spaces</th>
                      <th>Status</th>
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
                        <td>{hotel.pinAssignMode === 'auto' ? 'Auto' : 'Random'}</td>
                        <td>{hotel.availableSpaces} free / {hotel.spaceCount}</td>
                        <td>
                          <span className={`chip ${hotel.blocked ? 'blocked' : 'on'}`}>
                            {hotel.blocked ? 'Blocked' : 'Active'}
                          </span>
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

      {tab === 'spaces' && (
        <div className="admin-grid">
          <form className="panel form-panel" onSubmit={saveSpace}>
            <h2>Set manual PIN</h2>
            <label>
              Hotel
              <select
                value={form.hotelId}
                onChange={(e) => {
                  setEditingId(null)
                  setForm({ ...emptyForm, hotelId: e.target.value })
                }}
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
              Available parking space
              <select
                value={editingId ? String(editingId) : ''}
                onChange={(e) => {
                  const space = spaces.find((item) => String(item.id) === e.target.value)
                  if (!space) {
                    setEditingId(null)
                    setForm((prev) => ({ ...emptyForm, hotelId: prev.hotelId }))
                    return
                  }
                  setEditingId(space.id)
                  setForm({
                    hotelId: space.hotelId ? String(space.hotelId) : form.hotelId,
                    name: space.name,
                    lockId: space.lockId,
                    pin: space.pin || '',
                    notes: space.notes || '',
                    enabled: space.enabled,
                  })
                }}
                required
                disabled={!form.hotelId}
              >
                <option value="">{form.hotelId ? 'Select a free parking lock' : 'Select a hotel first'}</option>
                {selectableSpaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name} · lockId {space.lockId}{space.pin ? ' · editing' : ' · free'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              HHS Lock lockId
              <input value={form.lockId} readOnly placeholder="Filled when you select a space" />
            </label>
            <label>
              Manual PIN
              <input
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                inputMode="numeric"
                maxLength={6}
                placeholder="6 digits, or clear to free the lock"
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
              Choose a free parking lock, then enter a 6-digit PIN. Clear the PIN to make that lock available for bookings again.
            </p>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving || !editingId}>
                {saving ? 'Saving…' : 'Save PIN'}
              </button>
              {editingId && (
                <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setForm({ ...emptyForm, hotelId: form.hotelId }) }}>
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
              <p className="empty">
                No parking locks yet. Connect the hotel HHS Lock account under <strong>Hotels</strong> — every lock on that account is imported automatically. Available = no PIN, Occupied = has a PIN.
              </p>
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
                        <td><span className={`chip ${space.pin ? 'off' : (space.enabled ? 'on' : 'off')}`}>{!space.enabled ? 'Disabled' : (space.pin ? (space.bookingId ? `Occupied · Booking ${space.bookingId}` : 'Occupied') : 'Available')}</span></td>
                        <td className="actions">
                          <button type="button" className="btn btn-small" disabled={spaceBusy(space)} onClick={() => runCommand(space, 'unlock')}>Open</button>
                          <button type="button" className="btn btn-small" disabled={spaceBusy(space)} onClick={() => runCommand(space, 'lock')}>Lock</button>
                          <button type="button" className="btn btn-small" onClick={() => { setEditingId(space.id); setForm({ hotelId: space.hotelId ? String(space.hotelId) : '', name: space.name, lockId: space.lockId, pin: space.pin || '', notes: space.notes || '', enabled: space.enabled }); setTab('spaces') }}>Set PIN</button>
                          <button type="button" className="btn btn-small danger" disabled={spaceBusy(space)} onClick={() => removeSpace(space)}>
                            {busyId === `delete-${space.id}` ? 'Freeing…' : 'Free'}
                          </button>
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
              <h2>Hotel HHS Lock gateways</h2>
              <p className="lede tight">
                Locks on this hotel’s HHS Lock account are parking spaces automatically.
                Status is only <strong>Available</strong> or <strong>Occupied</strong>.
              </p>
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
              <button type="button" className="btn btn-ghost" onClick={() => refreshGateways()}>Refresh</button>
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
                          <tr><th>Lock</th><th>lockId</th><th>RSSI</th><th>Parking</th></tr>
                        </thead>
                        <tbody>
                          {gateway.locks.map((lock) => {
                            const lockKey = normalizeLockId(lock.lockId)
                            const space = spaceByLockId.get(lockKey)
                            // Only two states. Missing row is treated as Available (import pending/race).
                            const occupied = Boolean(String(space?.pin || '').trim())
                            const inPool = Boolean(space)
                            return (
                            <tr key={lock.lockId}>
                              <td><strong>{lock.lockAlias || lock.lockName}</strong></td>
                              <td><code>{lock.lockId}</code></td>
                              <td>{lock.rssi ?? '—'}</td>
                              <td>
                                <span className={`chip ${occupied ? 'off' : 'on'}`}>
                                  {occupied ? 'Occupied' : 'Available'}
                                </span>
                                {!inPool ? <div className="muted">Importing…</div> : null}
                              </td>
                            </tr>
                            )
                          })}
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
              <p className="lede tight">
                Synced from HHS PMS every 3 minutes. PIN = last 6 digits of booking ID.
                Auto mode uses the matching parking lock when the booking has parking info.
              </p>
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
