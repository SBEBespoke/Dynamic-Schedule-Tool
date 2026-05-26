import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useEvent } from '../../context/EventContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { fromMins, durStr, otStart, otEnd, otAdjusted } from '../../lib/time'
import AddEditSessionModal from '../modals/AddEditSessionModal'
import AddEditDayModal    from '../modals/AddEditDayModal'
import WeatherWidget      from '../WeatherWidget'

export default function ScheduleView() {
  const { eventId, days, onTrack, reload } = useEvent()
  const { isOpsOrAbove } = useAuth()
  const { toast } = useToast()

  const [activeDay,      setActiveDay]      = useState(null)
  const [showAddSession, setShowAddSession] = useState(false)
  const [editingSession, setEditingSession] = useState(null)
  const [showAddDay,     setShowAddDay]     = useState(false)
  const [editingDay,     setEditingDay]     = useState(null)
  const [deleting,       setDeleting]       = useState(null)

  const sortedDays = [...days].sort((a, b) => a.sort_order - b.sort_order)

  // Auto-select first day
  useEffect(() => {
    if (sortedDays.length > 0 && !activeDay) setActiveDay(sortedDays[0].id)
  }, [sortedDays, activeDay])

  // Sessions for the active day, sorted by scheduled start
  const daySessions = onTrack
    .filter(s => s.day_id === activeDay)
    .sort((a, b) => a.start_mins - b.start_mins)

  async function deleteSession(s) {
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return
    setDeleting(s.id)
    const { error } = await supabase.from('on_track_sessions').delete().eq('id', s.id)
    if (error) toast('Error', error.message, 'danger')
    else { toast('Session deleted', s.name, 'success'); reload() }
    setDeleting(null)
  }

  async function deleteDay(day) {
    if (!confirm(`Delete "${day.name}"?\n\nAll sessions on this day will also be deleted.`)) return
    setDeleting(day.id)
    const { error } = await supabase.from('days').delete().eq('id', day.id)
    if (error) { toast('Error', error.message, 'danger'); setDeleting(null); return }
    toast('Day deleted', day.name, 'success')
    const remaining = sortedDays.filter(d => d.id !== day.id)
    setActiveDay(remaining[0]?.id || null)
    reload()
    setDeleting(null)
  }

  const activeDay_ = sortedDays.find(d => d.id === activeDay)

  return (
    <div>
      {/* ── Day tabs ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="day-tabs" style={{ margin: 0 }}>
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
        {isOpsOrAbove && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAddDay(true)}>
            + Add Day
          </button>
        )}
      </div>

      {/* ── Weather ── */}
      <WeatherWidget />

      {/* ── No days yet ── */}
      {sortedDays.length === 0 && (
        <div className="empty">
          <div style={{ fontSize: 28, marginBottom: 10 }}>📅</div>
          No days set up yet.
          {isOpsOrAbove && <><br />Click <strong>+ Add Day</strong> above to get started.</>}
        </div>
      )}

      {/* ── Sessions for active day ── */}
      {activeDay_ && (
        <>
          <div className="sec-header" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="sec-title">On-Track Sessions</span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>({daySessions.length})</span>
            </div>

            {isOpsOrAbove && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingDay(activeDay_)}>
                  Edit Day
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => deleteDay(activeDay_)}
                  disabled={deleting === activeDay_?.id}
                >
                  Delete Day
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddSession(true)}>
                  + Session
                </button>
              </div>
            )}
          </div>

          {daySessions.length === 0 ? (
            <div className="empty">
              No sessions on this day yet.
              {isOpsOrAbove && <><br />Click <strong>+ Session</strong> to add one, or use Excel Import in Admin.</>}
            </div>
          ) : (
            daySessions.map(s => {
              const adjusted  = otAdjusted(s)
              const startDisp = adjusted ? otStart(s) : s.start_mins
              const endDisp   = adjusted ? otEnd(s)   : s.start_mins + s.duration_mins

              return (
                <div
                  key={s.id}
                  className={`session-item ${adjusted ? 'slipped' : ''}`}
                >
                  {/* Time */}
                  <div className={`s-time ${adjusted ? 'slipped' : ''}`}>
                    {fromMins(startDisp)}
                    <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 4, color: 'var(--text-dim)' }}>
                      → {fromMins(endDisp)}
                    </span>
                    {adjusted && s.start_mins !== startDisp && (
                      <div className="s-orig">{fromMins(s.start_mins)}</div>
                    )}
                  </div>

                  {/* Category (primary) + session name (support) */}
                  <div className="s-name" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{s.category || 'General'}</span>
                      {s.notes && (
                        <span title={s.notes} style={{ fontSize: 11, color: 'var(--text-dim)', cursor: 'help' }}>📋</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>{s.name}</span>
                  </div>

                  {/* Duration */}
                  <div className="s-dur">{durStr(s.duration_override ?? s.duration_mins)}</div>

                  {/* Constraint badges */}
                  {s.must_start_at != null && (
                    <span style={badge('#e8b000', 'rgba(232,176,0,0.12)')}>
                      🔒 {fromMins(s.must_start_at)}
                    </span>
                  )}
                  {s.must_finish_by != null && (
                    <span style={badge('#f97316', 'rgba(249,115,22,0.12)')}>
                      ⏱ by {fromMins(s.must_finish_by)}
                    </span>
                  )}

                  {/* Slip pills */}
                  {(s.slip_mins || 0) !== 0 && (
                    <span className="slip-pill">+{s.slip_mins}m</span>
                  )}
                  {(s.cascade_slip_mins || 0) > 0 && (
                    <span className="slip-pill cascade" title="Auto-cascaded">↓ +{s.cascade_slip_mins}m</span>
                  )}

                  {/* Actions */}
                  {isOpsOrAbove && (
                    <div className="s-actions">
                      <button className="btn btn-ghost btn-xs" onClick={() => setEditingSession(s)}>Edit</button>
                      <button
                        className="btn btn-danger btn-xs"
                        onClick={() => deleteSession(s)}
                        disabled={deleting === s.id}
                      >✕</button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </>
      )}

      {/* ── Modals ── */}
      {(showAddSession || editingSession) && (
        <AddEditSessionModal
          session={editingSession}
          days={sortedDays}
          defaultDayId={activeDay}
          eventId={eventId}
          onClose={() => { setShowAddSession(false); setEditingSession(null) }}
          onSaved={() => { setShowAddSession(false); setEditingSession(null); reload() }}
        />
      )}

      {(showAddDay || editingDay) && (
        <AddEditDayModal
          day={editingDay}
          eventId={eventId}
          existingCount={days.length}
          onClose={() => { setShowAddDay(false); setEditingDay(null) }}
          onSaved={(newId) => {
            setShowAddDay(false); setEditingDay(null)
            reload().then(() => { if (newId) setActiveDay(newId) })
          }}
        />
      )}
    </div>
  )
}

// Small helper for constraint badge styles
function badge(color, bg) {
  return {
    fontSize: 11, color, background: bg,
    padding: '2px 7px', borderRadius: 4,
    whiteSpace: 'nowrap', flexShrink: 0,
  }
}
