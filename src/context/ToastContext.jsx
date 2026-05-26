import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((title, body = '', type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, title, body, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const ICONS = { success: '✓', warn: '⚠', danger: '✕', info: 'ℹ' }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast stack — fixed bottom-right */}
      <div className="toast-stack">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast ${t.type}`}
            onClick={() => dismiss(t.id)}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ fontSize: 16, marginTop: 1, flexShrink: 0 }}>
              {ICONS[t.type] || ICONS.info}
            </div>
            <div style={{ flex: 1 }}>
              <div className="toast-title">{t.title}</div>
              {t.body && <div className="toast-body">{t.body}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
