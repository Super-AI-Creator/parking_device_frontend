import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫']

export default function AccessPage() {
  const { appName, authenticated, isAdmin, isManager } = useAuth()
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  function press(key) {
    setResult(null)
    if (key === 'C') {
      setPin('')
      return
    }
    if (key === '⌫') {
      setPin((value) => value.slice(0, -1))
      return
    }
    setPin((value) => (value.length >= 8 ? value : value + key))
  }

  async function run(action) {
    if (pin.length < 4 || loading) return
    setLoading(true)
    setResult(null)
    try {
      const data = action === 'unlock' ? await api.unlockByPin(pin) : await api.lockByPin(pin)
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
        message: err.status === 429 ? 'Please wait before trying again.' : 'Check your PIN and try again.',
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
        <p className="lede">Enter your parking PIN to open or lock the barrier.</p>
      </div>

      <div className="panel keypad-panel">
        <div className="pin-display" aria-live="polite">
          {pin ? '•'.repeat(pin.length) : '----'}
        </div>

        <div className="keypad" role="group" aria-label="PIN keypad">
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

        <div className="access-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => run('unlock')}
            disabled={loading || pin.length < 4}
          >
            {loading ? 'Working…' : 'Open'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => run('lock')}
            disabled={loading || pin.length < 4}
          >
            Lock
          </button>
        </div>

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
