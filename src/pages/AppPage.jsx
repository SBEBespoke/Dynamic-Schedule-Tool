import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { EventProvider, useEvent } from '../context/EventContext'
import { useAuth } from '../context/AuthContext'
import { getConflicts, getConflictPersonIds } from '../lib/conflicts'
import ScheduleView         from '../components/views/ScheduleView'
import ScheduleViewReadOnly from '../components/views/ScheduleViewReadOnly'
import ActivationsView      from '../components/views/ActivationsView'
import PeopleView           from '../components/views/PeopleView'
import MyScheduleView       from '../components/views/MyScheduleView'
import LiveUpdateView       from '../components/views/LiveUpdateView'
import ChecklistView        from '../components/views/ChecklistView'

// ── Role display labels ──
const ROLE_LABELS = {
  super_admin:  'Administrator',
  ops_lead:     'Ops Lead',
  area_manager: 'Area Manager',
  team_member:  'Team Member',
}

// ── Role preview options (for Administrator "View as") ──
const PREVIEW_ROLES = [
  { value: null,           label: 'Administrator' },
  { value: 'ops_lead',     label: 'Ops Lead' },
  { value: 'team_member',  label: 'Team Member' },
]

// ── Helper: effective permission from a role string ──
function roleIsOpsOrAbove(r) {
  return ['super_admin', 'ops_lead', 'area_manager'].includes(r)
}

// ── Main app shell ──
function AppShell() {
  const { event, loading, error, onTrack, areaSessions, people } = useEvent()
  const { profile, role, isOpsOrAbove, isSuperAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const [activeView,   setView]       = useState('schedule_ro')
  const [previewRole,  setPreviewRole] = useState(null)

  // Effective role: preview overrides real role (admins only)
  const effectiveRole        = isSuperAdmin && previewRole ? previewRole : role
  const effectiveIsOpsOrAbove = roleIsOpsOrAbove(effectiveRole)

  // ── Global conflict badge (always uses real role) ──
  const conflicts = useMemo(
    () => getConflicts(people, onTrack, areaSessions),
    [people, onTrack, areaSessions]
  )
  const conflictCount = useMemo(
    () => getConflictPersonIds(conflicts).size,
    [conflicts]
  )

  const VIEWS = [
    { id: 'schedule_ro',   label: '📋 On Track',        short: 'On Track',    roles: null },
    { id: 'activations',   label: '🎪 Activations',     short: 'Activations', roles: null },
    { id: 'people',        label: '👥 People',           short: 'People',      roles: ['super_admin', 'ops_lead'] },
    { id: 'live',          label: '🚨 Live Update',      short: 'Live',        roles: ['super_admin', 'ops_lead'] },
    { id: 'personal',      label: '📱 My Schedule',      short: 'Mine',        roles: null },
    { id: 'checklist',     label: '✅ Checklist',        short: 'Tasks',       roles: null },
    { id: 'schedule_edit', label: '✏️ Schedule Edit',    short: 'Edit',        roles: ['super_admin', 'ops_lead'] },
  ]

  // Filter nav tabs by effective role
  const visibleViews = VIEWS.filter(v => !v.roles || v.roles.includes(effectiveRole))

  // If active view becomes hidden after a role switch, fall back to first visible
  const activeViewIsVisible = visibleViews.some(v => v.id === activeView)

  function switchPreviewRole(newRole) {
    setPreviewRole(newRole)
    // Reset to On Track if current view would be hidden
    const wouldBeVisible = VIEWS
      .filter(v => !v.roles || v.roles.includes(newRole || role))
      .some(v => v.id === activeView)
    if (!wouldBeVisible) setView('schedule_ro')
  }

  if (loading) return <div className="page-loading">Loading event…</div>
  if (error)   return <div className="page-loading" style={{ color: 'var(--danger)' }}>Error: {error}</div>
  if (!event)  return <div className="page-loading">Event not found.</div>

  const isPreviewing = isSuperAdmin && previewRole !== null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── HEADER ── */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            className="btn btn-ghost btn-sm desktop-only"
            onClick={() => navigate('/events')}
            style={{ padding: '5px 10px' }}
          >
            ‹ Events
          </button>
          <div>
            <div style={styles.headerTitle}>{event.name}</div>
            {event.venue && <div style={styles.headerSub} className="desktop-only">📍 {event.venue}</div>}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Conflict badge — always real role */}
          {isOpsOrAbove && conflictCount > 0 && (
            <button
              style={conflictBadgeStyle}
              onClick={() => setView('people')}
              title="Click to view People and resolve conflicts"
            >
              ⚠ {conflictCount}
            </button>
          )}

          {/* View As — Administrator only */}
          {isSuperAdmin && (
            <div style={styles.viewAs} className="desktop-only">
              <span style={styles.viewAsLabel}>View as</span>
              <div style={styles.viewAsPills}>
                {PREVIEW_ROLES.map(pr => (
                  <button
                    key={String(pr.value)}
                    style={{
                      ...styles.viewAsPill,
                      ...(effectiveRole === (pr.value || 'super_admin') ? styles.viewAsPillActive : {}),
                    }}
                    onClick={() => switchPreviewRole(pr.value)}
                  >
                    {pr.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isSuperAdmin && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate(`/event/${event.id}/admin`)}
            >
              ⚙ <span className="desktop-only">Admin</span>
            </button>
          )}
          <span className={`badge badge-role-${role} desktop-only`}>
            {ROLE_LABELS[role] || role}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }} className="desktop-only">
            {profile?.name}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>
            <span className="desktop-only">Sign Out</span>
            <span className="mobile-only">✕</span>
          </button>
        </div>
      </div>

      {/* ── PREVIEW BANNER ── */}
      {isPreviewing && (
        <div style={styles.previewBanner}>
          <span>👁 Previewing as <strong>{ROLE_LABELS[previewRole]}</strong> — nav tabs are simulated. Content still uses Administrator permissions.</span>
          <button
            style={styles.previewClose}
            onClick={() => switchPreviewRole(null)}
          >
            Exit preview
          </button>
        </div>
      )}

      {/* ── DESKTOP NAV (top tabs) ── */}
      <nav style={styles.nav} className="desktop-nav">
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

      {/* ── MOBILE NAV (bottom tabs) ── */}
      <nav style={styles.mobileNav} className="mobile-nav">
        {visibleViews.map(v => (
          <button
            key={v.id}
            style={{ ...styles.mobileNavBtn, ...(activeView === v.id ? styles.mobileNavBtnActive : {}) }}
            onClick={() => setView(v.id)}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{v.label.split(' ')[0]}</span>
            <span style={{ fontSize: 9, marginTop: 2, fontWeight: activeView === v.id ? 700 : 400, letterSpacing: '-0.2px' }}>
              {v.short}
            </span>
          </button>
        ))}
      </nav>

      {/* ── VIEWS ── */}
      <main className="main">
        {activeView === 'schedule_ro'   && <ScheduleViewReadOnly />}
        {activeView === 'activations'   && <ActivationsView />}
        {activeView === 'people'        && effectiveIsOpsOrAbove && <PeopleView />}
        {activeView === 'live'          && effectiveIsOpsOrAbove && <LiveUpdateView />}
        {activeView === 'personal'      && <MyScheduleView />}
        {activeView === 'checklist'     && <ChecklistView />}
        {activeView === 'schedule_edit' && effectiveIsOpsOrAbove && <ScheduleView />}
      </main>
    </div>
  )
}

// ── Conflict badge style — pulsing red pill ──
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
  },
  headerTitle: {
    fontSize: '14px', fontWeight: 800,
    letterSpacing: '1.5px', textTransform: 'uppercase',
    color: 'var(--accent)', lineHeight: 1,
  },
  headerSub: { fontSize: '11px', color: 'var(--text-dim)', marginTop: 2 },

  // View As switcher
  viewAs: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '4px 10px',
  },
  viewAsLabel: {
    fontSize: 11, fontWeight: 600,
    color: 'var(--text-dim)',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
  },
  viewAsPills: { display: 'flex', gap: 4 },
  viewAsPill: {
    padding: '3px 10px', border: '1px solid var(--border)',
    borderRadius: 6, background: 'transparent',
    color: 'var(--text-dim)', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
  },
  viewAsPillActive: {
    background: 'var(--accent)', color: '#000',
    borderColor: 'var(--accent)',
  },

  // Preview banner
  previewBanner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    background: 'rgba(139,92,246,0.1)',
    borderBottom: '1px solid rgba(139,92,246,0.3)',
    padding: '8px 20px',
    fontSize: 12, color: '#c4b5fd',
  },
  previewClose: {
    padding: '3px 10px', border: '1px solid rgba(139,92,246,0.4)',
    borderRadius: 6, background: 'transparent',
    color: '#c4b5fd', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  },

  nav: {
    background: 'var(--surface)',
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
  mobileNav: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    background: 'var(--surface)',
    borderTop: '1px solid var(--border)',
    zIndex: 200,
    paddingBottom: 'env(safe-area-inset-bottom)',
  },
  mobileNavBtn: {
    flex: 1, border: 'none', background: 'none',
    color: 'var(--text-dim)', cursor: 'pointer',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '8px 2px',
    transition: 'color 0.15s',
    minHeight: 56,
  },
  mobileNavBtnActive: { color: 'var(--accent)' },
}

export default function AppPage() {
  return (
    <EventProvider>
      <AppShell />
    </EventProvider>
  )
}
