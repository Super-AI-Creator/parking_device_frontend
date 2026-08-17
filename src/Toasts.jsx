import { createContext, useCallback, useContext, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((item) => item.id !== id))
  }, [])

  const pushToast = useCallback((toast) => {
    const id = Date.now() + Math.random()
    const next = { id, type: 'success', duration: 8000, ...toast }
    setToasts((list) => [...list, next].slice(-6))
    window.setTimeout(() => dismiss(id), next.duration)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <article key={toast.id} className={`toast toast-${toast.type}`}>
            <div>
              <strong>{toast.title}</strong>
              {toast.body ? <span>{toast.body}</span> : null}
            </div>
            <button type="button" className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              ×
            </button>
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToasts() {
  return useContext(ToastContext) || { pushToast() {} }
}
