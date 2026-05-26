import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider }         from './context/ToastContext'
import LoginPage       from './pages/LoginPage'
import EventSelectPage from './pages/EventSelectPage'
import AppPage         from './pages/AppPage'
import AdminPage       from './pages/AdminPage'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div className="page-loading">Loading…</div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

function RootRedirect() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div className="page-loading">Loading…</div>
  return <Navigate to={isAuthenticated ? '/events' : '/login'} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/"       element={<RootRedirect />} />
      <Route path="/login"  element={<LoginPage />} />

      <Route path="/events" element={
        <ProtectedRoute><EventSelectPage /></ProtectedRoute>
      } />

      <Route path="/event/:eventId" element={
        <ProtectedRoute><AppPage /></ProtectedRoute>
      } />

      <Route path="/event/:eventId/admin" element={
        <ProtectedRoute><AdminPage /></ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  )
}
