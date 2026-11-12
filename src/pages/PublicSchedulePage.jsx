import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fromMins, durStr, otStart, otEnd, otAdjusted } from '../lib/time'
import { areaStart, areaEnd, isAreaSlipped } from '../lib/conflicts'

const REFRESH_MS = 30_000

export default function PublicSchedulePage() {
  const { eventId } = useParams()

  const [data,      setData]      = useState(null)
  const [error,     setError]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [activeTab, setActiveTab] = useState('ontrack') // 'ontrack' | 'activations'
  const [activeDay, setActiveDay] = useState(null)

  const fetchData = useCallback(async () => {
    const [
      { data: event,        error: e1 },
      { data: days,         error: e2 },
      { data: onTrack,      error: e3 },
      { data: areas,        error: e4 },
      { data: areaSessions, error: e5 },
    ] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('days').select('*').eq('event_id', eventId).order('sort_order'),
      supabase.from('on_track_sessions').select('*').eq('event_id', eventId).order('start_mins'),
      supabase.from('areas').select('*').eq('event_id', eventId).order('name'),
      supabase.from('area_sessions').select('*').eq('event_id', eventId),
    ])

    const err = e1 || e2 || e3 || e4 || e5
    if (err) { setError(err.message); setLoading(false); return }
    setData({ event, days, onTrack, areas, areaSessions })
    setLastRefresh(new Date())
    setLoading(false)
  }, [eventId])

  // Initial load + polling
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, REFRESH_MS)
    return () => clearInterval(interval)
  }, [fetchData])

  // Auto-select first day when data loads
  useEffect(() => {
    if (data?.days?.length && !activeDay) {
      setActiveDay(data.days[0].id)
    }
  }, [data, activeDay])

  if (loading) return (
    <div style={styles.page}>
      <div style={styles.loadingBox}>Loading schedule…</div>
    </div>
  )

  if (error) return (
    <div style={styles.page}>
      <div style={styles.errorBox}>Unable to load schedule: {error}</div>
    </div>
  )

  const { event, days, onTrack, areas, areaSessions } = data
  const sortedDays = [...days].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div style={styles.page}>
      {/* ── Header ── */}
      <div style={styles.header}>
        <div>
          <div style={styles.eventName}>{event.name}</div>
          <div style={styles.liveChip}>
            <span style={styles.liveDot} />
            LIVE · refreshes every 30s
            {lastRefresh && (
              <span style={{ marginLeft: 8, opacity: 0.7 }}>
                · updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
        <div style={styles.brandMark}>SBE Bespoke Events</div>
      </div>

      {/* ── View tabs ── */}
      <div style={styles.viewTabs}>
        <button
          style={{ ...styles.viewTab, ...(activeTab === 'ontrack' ? styles.viewTabActive : {}) }}
          onClick={() => setActiveTab('ontrack')}
        >
          📋 On Track
        </button>
        <button
          style={{ ...styles.viewTab, ...(activeTab === 'activations' ? styles.viewTabActive : {}) }}
          onClick={() => setActiveTab('activations')}
        >
          🎪 Activations
        </button>
      </div>

      {/* ── Day tabs ── */}
      {sortedDays.length > 0 && (
        <div className="day-tabs" style={{ margin: '0 0 20px 0' }}>
          {sortedDays.map(d => (
            <button
              key={d.id}
              className={`day-tab ${activeDay === d.id ? 'active' : ''}`}
              onClick={() => setActiveDay(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      {activeTab === 'ontrack'
        ? <OnTrackPanel days={sortedDays} onTrack={onTrack} activeDay={activeDay} />
        : <ActivationsPanel days={sortedDays} onTrack={onTrack} areas={areas} areaSessions={areaSessions} activeDay={activeDay} />
      }
    </div>
  )
}

// ── On Track view ─────────────────────────────────────────────────────────────

function OnTrackPanel({ onTrack, activeDay }) {
  const daySessions = onTrack
    .filter(s => s.day_id === activeDay)
    .sort((a, b) => {
      const aStart = otAdjusted(a) ? otStart(a) : a.start_mins
      const bStart = otAdjusted(b) ? otStart(b) : b.start_mins
      return aStart - bStart
    })

  const hasSlips = daySessions.some(s => otAdjusted(s))

  if (daySessions.length === 0) return (
    <div className="empty">No sessions on this day.</div>
  )

  return (
    <div>
      {hasSlips && (
        <div style={styles.slipBanner}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          Schedule has changed — updated times are shown below
        </div>
      )}

      {daySessions.map(s => {
        const adjusted  = otAdjusted(s)
        const startDisp = adjusted ? otStart(s) : s.start_mins
        const endDisp   = adjusted ? otEnd(s)   : s.start_mins + s.duration_mins

        return (
          <div key={s.id} className={`session-item ${adjusted ? 'slipped' : ''}`}>
            <div className={`s-time ${adjusted ? 'slipped' : ''}`}>
              {fromMins(startDisp)}
              <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 4, color: 'var(--text-dim)' }}>
                → {fromMins(endDisp)}
              </span>
              {adjusted && s.start_mins !== startDisp && (
                <div className="s-orig">{fromMins(s.start_mins)}</div>
              )}
            </div>

            <div className="s-name" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{s.category || 'General'}</span>
                {s.notes && (
                  <span title={s.notes} style={{ fontSize: 11, color: 'var(--text-dim)', cursor: 'help' }}>📋</span>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>{s.name}</span>
            </div>

            <div className="s-dur">{durStr(s.duration_override ?? s.duration_mins)}</div>

            {(s.slip_mins || 0) !== 0 && (
              <span className="slip-pill">+{s.slip_mins}m</span>
            )}
            {(s.cascade_slip_mins || 0) > 0 && (
              <span className="slip-pill cascade" title="Auto-cascaded">↓ +{s.cascade_slip_mins}m</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Activations view ──────────────────────────────────────────────────────────

function ActivationsPanel({ onTrack, areas, areaSessions, activeDay }) {
  const dayAreaSessions = areaSessions.filter(s => s.day_id === activeDay)

  if (areas.length === 0) return (
    <div className="empty">
      <div style={{ fontSize: 28, marginBottom: 10 }}>🎪</div>
      No areas set up yet.
    </div>
  )

  return (
    <div>
      <style>{`
        @media (max-width: 700px) { .pub-activations-grid { grid-template-columns: 1fr !important; } }
        @media (min-width: 701px) and (max-width: 1050px) { .pub-activations-grid { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>
      <div className="pub-activations-grid" style={styles.activationsGrid}>
        {areas.map(area => {
          const sessions = dayAreaSessions
            .filter(s => s.area_id === area.id)
            .sort((a, b) => (areaStart(a, onTrack) ?? 0) - (areaStart(b, onTrack) ?? 0))

          return (
            <div key={area.id} style={areaCard(area.color)}>
              {/* Area header */}
              <div style={styles.areaHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={colorDot(area.color)} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{area.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>({sessions.length})</span>
                </div>
              </div>

              {sessions.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '4px 0' }}>
                  No sessions on this day.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sessions.map(session => {
                    const start   = areaStart(session, onTrack)
                    const end     = areaEnd(session, onTrack)
                    const slipped = isAreaSlipped(session, onTrack)
                    const timeText = (start != null && end != null)
                      ? `${fromMins(start)} → ${fromMins(end)} (${durStr(end - start)})`
                      : '—'

                    return (
                      <div key={session.id} style={sessionCard(slipped)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: slipped ? 'var(--warning)' : 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                            {timeText}
                          </div>
                          {slipped && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--warning)', letterSpacing: '0.5px' }}>↓ SLIP</span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                          {session.name}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '24px 20px 60px',
    fontFamily: 'inherit',
  },
  loadingBox: {
    textAlign: 'center',
    padding: 60,
    color: 'var(--text-dim)',
    fontSize: 14,
  },
  errorBox: {
    textAlign: 'center',
    padding: 40,
    color: 'var(--danger)',
    fontSize: 14,
    background: 'var(--danger-subtle)',
    borderRadius: 10,
    border: '1px solid rgba(239,68,68,0.3)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 16,
    flexWrap: 'wrap',
  },
  eventName: {
    fontSize: 22,
    fontWeight: 800,
    color: 'var(--text)',
    letterSpacing: '-0.5px',
    marginBottom: 6,
  },
  liveChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-dim)',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: '4px 10px',
    letterSpacing: '0.3px',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#22c55e',
    animation: 'pulse 2s infinite',
    flexShrink: 0,
  },
  brandMark: {
    fontSize: 11,
    color: 'var(--text-dim)',
    fontWeight: 600,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
    paddingTop: 4,
  },
  viewTabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 20,
    borderBottom: '1px solid var(--border)',
    paddingBottom: 0,
  },
  viewTab: {
    padding: '9px 18px',
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'none',
    color: 'var(--text-dim)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: '-1px',
    transition: 'color 0.15s, border-color 0.15s',
  },
  viewTabActive: {
    color: 'var(--accent)',
    borderBottomColor: 'var(--accent)',
  },
  slipBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(249,115,22,0.08)',
    border: '1px solid rgba(249,115,22,0.3)',
    borderRadius: 8,
    padding: '10px 14px',
    marginBottom: 16,
    fontSize: 13,
    color: 'var(--warning)',
    fontWeight: 600,
  },
  activationsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    alignItems: 'flex-start',
  },
  areaHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 6,
  },
}

function areaCard(color) {
  return {
    background: 'var(--surface)',
    border: `1px solid ${color}55`,
    borderTop: `3px solid ${color}`,
    borderRadius: 10,
    padding: '12px 14px',
  }
}

function colorDot(color) {
  return {
    width: 10, height: 10,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }
}

function sessionCard(slipped) {
  return {
    background: slipped ? 'rgba(249,115,22,0.05)' : 'var(--surface2)',
    border: `1px solid ${slipped ? 'rgba(249,115,22,0.25)' : 'var(--border)'}`,
    borderRadius: 7,
    padding: '9px 11px',
  }
}
