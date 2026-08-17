import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import AccessPage from './pages/AccessPage.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ManagerDashboard from './pages/ManagerDashboard.jsx'
import RegisterPage from './pages/RegisterPage.jsx'

function Shell({ children }) {
  const { appName, authenticated, isAdmin, isManager, logout } = useAuth()
  const { pathname } = useLocation()
  const showNav = !pathname.startsWith('/login') && !pathname.startsWith('/register')

  return (
    <div className="app-shell">
      <header className="topbar product">
        <Link to="/" className="brand brand-link">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>{appName}</strong>
            <span>Smart parking access</span>
          </div>
        </Link>
        {showNav && (
          <nav className="top-nav">
            <Link to="/" className={pathname === '/' ? 'active' : ''}>Customer</Link>
            {authenticated && isManager && !isAdmin && (
              <Link to="/manager" className={pathname.startsWith('/manager') ? 'active' : ''}>Manager</Link>
            )}
            {authenticated && isAdmin && (
              <Link to="/admin" className={pathname.startsWith('/admin') ? 'active' : ''}>Admin</Link>
            )}
            {!authenticated ? (
              <Link to="/login" className={pathname.startsWith('/login') ? 'active' : ''}>Login</Link>
            ) : (
              <button type="button" className="nav-btn" onClick={() => logout()}>Sign out</button>
            )}
          </nav>
        )}
      </header>
      <main className="page">{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell>
        <Routes>
          <Route path="/" element={<AccessPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/manager" element={<ManagerDashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/login" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </AuthProvider>
  )
}
