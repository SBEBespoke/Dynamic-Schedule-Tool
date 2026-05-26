import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function EventSelectPage() {
  const { profile, isSuperAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', venue: '', start_date: '', end_date: '' })

  useEffect(() => {
    loadEvents()
  }, [])

  async function loadEvents() {
    setLoading(true)
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('start_date', { ascending: false })
    setEvents(data || [])
    setLoading(false)
  }

  async function createEvent(e) {
    e.preventDefault()
    setCreating(true)
    const { data, error } = await supabase
      .from('events')
      .insert([{ ...form, created_by: profile.id }])
      .select()
      .single()

    if (!error && data) {
      navigate(`/event/${data.id}`)
    } else {
      alert('Failed to create event: ' + (error?.message || 'Unknown error'))
    }
    setCreating(false)
  }

  function formatDateRange(start, end) {
    if (!start) return 'Date TBC'
    const s = new Date(start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    if (!end || end === start) return s
    const e = new Date(end).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    return `${s} – ${e}`
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>📋 LIVE SCHEDULE MANAGER</div>
          <div style={styles.sub}>SBE Bespoke Events</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={styles.userLabel}>{profile?.name || 'User'}</span>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign Out</button>
        </div>
      </div>

      <div style={styles.content}>
        <div style={styles.sectionHeader}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Events</h2>
          {isSuperAdmin && (
            <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
              {showForm ? '✕ Cancel' : '+ New Event'}
            </button>
          )}
        </div>

        {/* Create event form */}
        {showForm && isSuperAdmin && (
          <div className="card" style={{ borderColor: 'rgba(232,176,0,0.3)', marginBottom: 24 }}>
            <div className="card-label" style={{ marginBottom: 16 }}>New Event</div>
            <form onSubmit={createEvent}>
              <div className="form-row">
                <div className="form-group">
                  <label>Event Name *</label>
                  <input
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Adelaide Grand Final 2026"
                  />
                </div>
                <div className="form-group">
                  <label>Venue</label>
                  <input
                    value={form.venue}
                    onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                    placeholder="e.g. Adelaide Parklands Circuit"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating…' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Event list */}
        {loading ? (
          <div className="empty">Loading events…</div>
        ) : events.length === 0 ? (
          <div className="empty">
            No events yet.
            {isSuperAdmin && <><br />Use the "New Event" button above to get started.</>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map(ev => (
              <div
                key={ev.id}
                style={styles.eventCard}
                onClick={() => navigate(`/event/${ev.id}`)}
              >
                <div style={{ flex: 1 }}>
                  <div style={styles.eventName}>{ev.name}</div>
                  <div style={styles.eventMeta}>
                    {ev.venue && <span>📍 {ev.venue}</span>}
                    <span>📅 {formatDateRange(ev.start_date, ev.end_date)}</span>
                  </div>
                </div>
                <div style={styles.chevron}>›</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
  },
  header: {
    background: 'var(--surface)',
    borderBottom: '2px solid var(--accent)',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '14px',
    fontWeight: '800',
    letterSpacing: '2px',
    color: 'var(--accent)',
    textTransform: 'uppercase',
  },
  sub: {
    fontSize: '11px',
    color: 'var(--text-dim)',
    marginTop: '2px',
  },
  userLabel: {
    fontSize: '13px',
    color: 'var(--text-dim)',
  },
  content: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '32px 20px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
  },
  eventCard: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '18px 20px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
  },
  eventName: {
    fontSize: '16px',
    fontWeight: '700',
    marginBottom: '6px',
  },
  eventMeta: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
    color: 'var(--text-dim)',
  },
  chevron: {
    fontSize: '24px',
    color: 'var(--text-dim)',
    marginLeft: '12px',
  },
}
