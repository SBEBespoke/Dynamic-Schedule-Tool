import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { EventProvider, useEvent } from '../context/EventContext'
import { useAuth } from '../context/AuthContext'
import { getConflicts, getConflictPersonIds } from '../lib/conflicts'
import ScheduleView    from '../components/views/ScheduleView'
import ActivationsView from '../components/views/ActivationsView'
import PeopleView      from '../components/views/PeopleView'
import MyScheduleView  from '../components/views/MyScheduleView'
import LiveUpdateView  from '../components/views/LiveUpdateView'

// ── Placeholder (for Phase 4 views) ──
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
  const { event, loading, error, onTrack, areaSessions, people } = useEvent()
  const { profile, role, isOpsOrAbove, isSuperAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const [activeView, setView] = useState('schedule')

  // ── Global conflict badge ──
  const conflicts = useMemo(
    () => getConflicts(people, onTrack, areaSessions),
    [people, onTrack, areaSessions]
  )
  const conflictCount = useMemo(
    () => getConflictPersonIds(conflicts).size,
    [conflicts]
  )

  const VIEWS = [
    { id: 'schedule',    label: '📋 Schedule',    roles: null },
    { id: 'activations', label: '🎪 Activations', roles: null },
    { id: 'people',      label: '👥 People',      roles: ['super_admin', 'ops_lead'] },
    { id: 'live',        label: '🚨 Live Update', roles: ['super_admin', 'ops_lead'] },
    { id: 'personal',    label: '📱 My Schedule', roles: null },
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

          {/* ── Conflict badge — visible to ops+ when clashes exist ── */}
          {isOpsOrAbove && conflictCount > 0 && (
            <button
              style={conflictBadgeStyle}
              onClick={() => setView('people')}
              title="Click to view People and resolve conflicts"
            >
              ⚠ {conflictCount} conflict{conflictCount > 1 ? 's' : ''}
            </button>
          )}

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
        {activeView === 'live'        && isOpsOrAbove && <LiveUpdateView />}
        {activeView === 'personal'    && <MyScheduleView />}
      </main>
    </div>
  )
}

// ── Conflict badge style — pulsing orange pill ──
const conflictBadgeStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: '#ef4444',
  background: 'rgba(239,68,68,0.12)',
  border: '1px solid rgba(239,68,68,0.4)',
  borderRadius: 20,
  padding: '4px 12px',
  cursor: 'pointer',
  animation: 'pulse 2s ease-in-out infinite',
  whiteSpace: 'nowrap',
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
