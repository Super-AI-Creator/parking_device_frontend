import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [appName, setAppName] = useState('ParkAccess')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await api.me()
      setUser(data.authenticated ? data.user : null)
      if (data.app) setAppName(data.app)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function login(username, password) {
    const data = await api.login(username, password)
    setUser(data.user)
    if (data.app) setAppName(data.app)
    return data
  }

  async function logout() {
    await api.logout()
    setUser(null)
  }

  const role = user?.role || null
  const authenticated = Boolean(user)

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        authenticated,
        appName,
        loading,
        login,
        logout,
        refresh,
        isAdmin: role === 'admin',
        isManager: role === 'manager' || role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
