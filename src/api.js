const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `Request failed (${response.status})`
    const error = new Error(message)
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}

export const api = {
  health: () => request('/api/health'),
  me: () => request('/api/auth/me'),
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (body) =>
    request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request('/api/auth/logout', { method: 'POST', body: '{}' }),
  dashboard: () => request('/api/dashboard'),
  listUsers: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/api/admin/users${q ? `?${q}` : ''}`)
  },
  approveUser: (id) => request(`/api/admin/users/${id}/approve`, { method: 'POST', body: '{}' }),
  rejectUser: (id) => request(`/api/admin/users/${id}/reject`, { method: 'POST', body: '{}' }),
  disableUser: (id) => request(`/api/admin/users/${id}/disable`, { method: 'POST', body: '{}' }),
  deleteUser: (id) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),
  getTtlock: () => request('/api/me/ttlock'),
  saveTtlock: (body) => request('/api/me/ttlock', { method: 'PUT', body: JSON.stringify(body) }),
  getPms: () => request('/api/me/pms'),
  savePms: (body) => request('/api/me/pms', { method: 'PUT', body: JSON.stringify(body) }),
  syncHotels: () => request('/api/me/pms/sync-hotels', { method: 'POST', body: '{}' }),
  syncBookings: () => request('/api/me/pms/sync-bookings', { method: 'POST', body: '{}' }),
  listHotels: () => request('/api/hotels'),
  saveHotelTtlock: (hotelId, body) =>
    request(`/api/hotels/${hotelId}/ttlock`, { method: 'PUT', body: JSON.stringify(body) }),
  listHotelGateways: (hotelId, includeLocks = true) =>
    request(`/api/hotels/${hotelId}/gateways?includeLocks=${includeLocks ? '1' : '0'}`),
  listBookings: (hotelId) =>
    request(`/api/bookings${hotelId ? `?hotelId=${hotelId}` : ''}`),
  listGateways: (includeLocks = true) =>
    request(`/api/gateways?includeLocks=${includeLocks ? '1' : '0'}`),
  listSpaces: (hotelId) =>
    request(`/api/parking-spaces${hotelId ? `?hotelId=${hotelId}` : ''}`),
  createSpace: (body) =>
    request('/api/parking-spaces', { method: 'POST', body: JSON.stringify(body) }),
  updateSpace: (id, body) =>
    request(`/api/parking-spaces/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteSpace: (id) => request(`/api/parking-spaces/${id}`, { method: 'DELETE' }),
  unlockByPin: (hotelId, pin) =>
    request('/api/unlock', { method: 'POST', body: JSON.stringify({ hotelId, pin }) }),
  lockByPin: (hotelId, pin) =>
    request('/api/lock', { method: 'POST', body: JSON.stringify({ hotelId, pin }) }),
  spaceCommand: (id, action) =>
    request(`/api/parking-spaces/${id}/${action}`, { method: 'POST', body: '{}' }),
  listLogs: (limit = 100) => request(`/api/logs?limit=${limit}`),
  clearLogs: () => request('/api/logs', { method: 'DELETE' }),
}
