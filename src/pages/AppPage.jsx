import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EventProvider, useEvent } from '../context/EventContext'
import { useAuth } from '../context/AuthContext'
import ScheduleView     from '../components/views/ScheduleView'
import ActivationsView  from '../components/views/ActivationsView'
import PeopleView       from '../components/views/PeopleView'

// ── Placeholder (for views built in Phase 3 & 4) ──
function Placeholder({ label }) {
  return (
    <div className="empty" style={{ paddingTop: 60 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>{label}</div>
      <div>Coming in the next build phase.</div>
    </div>
  )
}

// ── Role display labels ──
const ROLE_LABELS = {
  super_admin:  'Super Admin',
  ops_lead:     'Ops Lead',
  area_manager: 'Area Manager',
  team_member:  'Team Member',
}

// ── Main app shell ──
function AppShell() {
  const { event, loading, error } = useEvent()
  const { profile, role, isOpsOrAbove, isSuperAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const [activeView, setView] = useState('schedule')

  const VIEWS = [
    { id: 'schedule',    label: '📋 Schedule',        roles: null },
    { id: 'activations', label: '🎪 Activations',     roles: null },
    { id: 'people',      label: '👥 People',          roles: ['super_admin', 'ops_lead'] },
    { id: 'live',        label: '🚨 Live Update',     roles: ['super_admin', 'ops_lead'] },
    { id: 'personal',    label: '📱 My Schedule',     roles: null },
  ]

  const visibleViews = VIEWS.filter(v => !v.roles || v.roles.includes(role))

  if (loading) return <div className="page-loading">Loading event…</div>
  if (error)   return <div className="page-loading" style={{ color: 'var(--danger)' }}>Error: {error}</div>
  if (!event)  return <div className="page-loading">Event not found.</div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── HEADER ── */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/events')}
            style={{ padding: '5px 10px' }}
          >
            ‹ Events
          </button>
          <div>
            <div style={styles.headerTitle}>{event.name}</div>
            {event.venue && <div style={styles.headerSub}>📍 {event.venue}</div>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Conflict badge placeholder — wired in Phase 4 */}
          <div id="conflict-badge" style={{ display: 'none' }} />

          {isSuperAdmin && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate(`/event/${event.id}/admin`)}
            >
              ⚙ Admin
            </button>
          )}

          <span className={`badge badge-role-${role}`}>
            {ROLE_LABELS[role] || role}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{profile?.name}</span>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign Out</button>
        </div>
      </div>

      {/* ── NAV ── */}
      <nav style={styles.nav}>
        {visibleViews.map(v => (
          <button
            key={v.id}
            style={{ ...styles.navBtn, ...(activeView === v.id ? styles.navBtnActive : {}) }}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {/* ── VIEWS ── */}
      <main className="main">
        {activeView === 'schedule'    && <ScheduleView />}
        {activeView === 'activations' && <ActivationsView />}
        {activeView === 'people'      && isOpsOrAbove && <PeopleView />}
        {activeView === 'live'        && isOpsOrAbove && <Placeholder label="Live Track Update View" />}
        {activeView === 'personal'    && <Placeholder label="My Schedule View" />}
      </main>
    </div>
  )
}

const styles = {
  header: {
    background: 'var(--surface)',
    borderBottom: '2px solid var(--accent)',
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    gap: 12,
    flexWrap: 'wrap',
  },
  headerTitle: {
    fontSize: '14px', fontWeight: 800,
    letterSpacing: '1.5px', textTransform: 'uppercase',
    color: 'var(--accent)', lineHeight: 1,
  },
  headerSub: { fontSize: '11px', color: 'var(--text-dim)', marginTop: 2 },
  nav: {
    display: 'flex', background: 'var(--surface)',
    borderBottom: '1px solid var(--border)', overflowX: 'auto',
  },
  navBtn: {
    padding: '11px 18px', border: 'none', background: 'none',
    color: 'var(--text-dim)', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', whiteSpace: 'nowrap',
    borderBottom: '2px solid transparent',
    transition: 'color 0.15s, border-color 0.15s', letterSpacing: '0.3px',
  },
  navBtnActive: { color: 'var(--accent)', borderBottomColor: 'var(--accent)' },
}

export default function AppPage() {
  return (
    <EventProvider>
      <AppShell />
    </EventProvider>
  )
}
