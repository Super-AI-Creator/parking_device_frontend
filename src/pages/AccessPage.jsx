import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫']
const HOTEL_MAX = 12
const PIN_LEN = 6

export default function AccessPage() {
  const { appName, authenticated, isAdmin, isManager } = useAuth()
  const [step, setStep] = useState('hotel')
  const [hotelId, setHotelId] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const value = step === 'hotel' ? hotelId : pin

  function press(key) {
    setResult(null)
    if (key === 'C') {
      if (step === 'pin') setPin('')
      else setHotelId('')
      return
    }
    if (key === '⌫') {
      if (step === 'pin') setPin((current) => current.slice(0, -1))
      else setHotelId((current) => current.slice(0, -1))
      return
    }
    if (step === 'pin') {
      setPin((current) => (current.length >= PIN_LEN ? current : current + key))
    } else {
      setHotelId((current) => (current.length >= HOTEL_MAX ? current : current + key))
    }
  }

  function goToPin() {
    if (hotelId.length < 1) return
    setStep('pin')
    setResult(null)
  }

  function goToHotel() {
    setStep('hotel')
    setPin('')
    setResult(null)
  }

  async function run(action) {
    if (pin.length !== PIN_LEN || loading) return
    setLoading(true)
    setResult(null)
    try {
      const data = action === 'unlock'
        ? await api.unlockByPin(hotelId, pin)
        : await api.lockByPin(hotelId, pin)
      setResult({
        ok: true,
        title: action === 'unlock' ? 'Barrier opening' : 'Barrier locking',
        detail: data.spaceName || 'Parking space',
        message: data.message,
      })
      setPin('')
    } catch (err) {
      setResult({
        ok: false,
        title: 'Request failed',
        detail: err.message,
        message: err.status === 429 ? 'Please wait before trying again.' : 'Check hotel ID and PIN, then try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  const consolePath = isAdmin ? '/admin' : isManager ? '/manager' : '/login'

  return (
    <section className="access-layout">
      <div className="access-hero">
        <p className="eyebrow">Customer access</p>
        <h1>{appName}</h1>
        <p className="lede">Enter the hotel ID, then your 6-digit parking PIN.</p>
      </div>

      <div className="panel keypad-panel">
        <div className="access-steps" aria-label="Access steps">
          <button type="button" className={`step-chip ${step === 'hotel' ? 'active' : ''}`} onClick={goToHotel}>
            1. Hotel ID
          </button>
          <button
            type="button"
            className={`step-chip ${step === 'pin' ? 'active' : ''}`}
            onClick={goToPin}
            disabled={!hotelId}
          >
            2. PIN
          </button>
        </div>

        <div className={`pin-display ${step === 'hotel' ? 'plain' : ''}`} aria-live="polite">
          {step === 'hotel'
            ? (hotelId || 'Hotel ID')
            : (pin ? pin.padEnd(PIN_LEN, '-') : '------')}
        </div>
        <p className="muted access-hint">
          {step === 'hotel'
            ? 'Use the hotel ID from your booking confirmation.'
            : `Hotel ${hotelId} · last 6 digits of the booking ID`}
        </p>

        <div className="keypad" role="group" aria-label={step === 'hotel' ? 'Hotel ID keypad' : 'PIN keypad'}>
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`key ${key === 'C' || key === '⌫' ? 'key-muted' : ''}`}
              onClick={() => press(key)}
              disabled={loading}
            >
              {key}
            </button>
          ))}
        </div>

        {step === 'hotel' ? (
          <div className="access-actions">
            <button
              type="button"
              className="btn btn-primary"
              style={{ gridColumn: '1 / -1' }}
              onClick={goToPin}
              disabled={!value || value.length < 1}
            >
              Continue to PIN
            </button>
          </div>
        ) : (
          <div className="access-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => run('unlock')}
              disabled={loading || pin.length !== PIN_LEN}
            >
              {loading ? 'Working…' : 'Open'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => run('lock')}
              disabled={loading || pin.length !== PIN_LEN}
            >
              Lock
            </button>
            <button type="button" className="btn btn-ghost" style={{ gridColumn: '1 / -1' }} onClick={goToHotel}>
              Change hotel ID
            </button>
          </div>
        )}

        {result && (
          <div className={`result ${result.ok ? 'success' : 'error'}`}>
            <strong>{result.title}</strong>
            <span>{result.detail}</span>
            <span className="muted">{result.message}</span>
          </div>
        )}
      </div>

      <div className="access-links">
        {authenticated ? (
          <Link to={consolePath}>Open console</Link>
        ) : (
          <>
            <Link to="/login">Manager / Admin login</Link>
            <Link to="/register">Register as parking manager</Link>
          </>
        )}
      </div>
    </section>
  )
}
