import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage       from './pages/LoginPage'
import EventSelectPage from './pages/EventSelectPage'
import AppPage         from './pages/AppPage'

// HashRouter is used so GitHub Pages works without server-side routing config.
// URLs will look like: https://you.github.io/repo/#/events

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
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      <Route path="/events" element={
        <ProtectedRoute><EventSelectPage /></ProtectedRoute>
      } />

      <Route path="/event/:eventId" element={
        <ProtectedRoute><AppPage /></ProtectedRoute>
      } />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}
