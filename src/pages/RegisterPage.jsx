import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'

export default function RegisterPage() {
  const { appName } = useAuth()
  const [form, setForm] = useState({
    username: '',
    password: '',
    displayName: '',
    email: '',
    companyName: '',
  })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.register(form)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <section className="login-layout">
        <div className="panel login-panel">
          <p className="eyebrow">{appName}</p>
          <h1>Registration received</h1>
          <p className="lede">
            Your parking manager account is pending administrator approval. You can sign in after approval.
          </p>
          <Link className="btn btn-primary btn-block" to="/login">
            Go to login
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="login-layout">
      <form className="panel login-panel" onSubmit={onSubmit}>
        <p className="eyebrow">{appName}</p>
        <h1>Register as parking manager</h1>
        <p className="lede">
          After approval you can connect your TTLock account and manage gateways for your region.
        </p>

        <label>
          Username
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
            minLength={3}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={6}
          />
        </label>
        <label>
          Display name
          <input
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </label>
        <label>
          Company / site
          <input
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>

        {error && <div className="banner error">{error}</div>}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit registration'}
        </button>

        <div className="access-links">
          <Link to="/login">Already have an account?</Link>
          <Link to="/">Customer access</Link>
        </div>
      </form>
    </section>
  )
}
