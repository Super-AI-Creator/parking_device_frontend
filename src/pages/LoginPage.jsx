import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export default function LoginPage() {
  const { authenticated, isAdmin, isManager, login, appName, loading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && authenticated) {
    return <Navigate to={isAdmin ? '/admin' : isManager ? '/manager' : '/'} replace />
  }

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await login(username.trim(), password)
      const role = data.user?.role
      navigate(role === 'admin' ? '/admin' : '/manager', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="login-layout">
      <form className="panel login-panel" onSubmit={onSubmit}>
        <p className="eyebrow">{appName}</p>
        <h1>Sign in</h1>
        <p className="lede">Parking managers and administrators access the operations console here.</p>

        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <div className="banner error">{error}</div>}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="access-links">
          <Link to="/register">Register as parking manager</Link>
          <Link to="/">Customer PIN access</Link>
        </div>
      </form>
    </section>
  )
}
