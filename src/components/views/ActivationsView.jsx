import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useEvent } from '../../context/EventContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { fromMins, durStr } from '../../lib/time'
import { areaStart, areaEnd, isAreaSlipped } from '../../lib/conflicts'
import AddEditAreaModal        from '../modals/AddEditAreaModal'
import AddEditAreaSessionModal from '../modals/AddEditAreaSessionModal'

export default function ActivationsView() {
  const { eventId, days, onTrack, areas, areaSessions, reload } = useEvent()
  const { isOpsOrAbove } = useAuth()
  const { toast } = useToast()

  const sortedDays = [...days].sort((a, b) => a.sort_order - b.sort_order)

  const [activeDay, setActiveDay] = useState(null)
  const [deleting,  setDeleting]  = useState(null)

  // Area modals
  const [showAddArea,  setShowAddArea]  = useState(false)
  const [editingArea,  setEditingArea]  = useState(null)

  // Area session modals
  const [addingSessionToArea,   setAddingSessionToArea]   = useState(null) // area object
  const [editingAreaSession,    setEditingAreaSession]     = useState(null) // { session, area }

  // Auto-select first day
  useEffect(() => {
    if (sortedDays.length > 0 && !activeDay) setActiveDay(sortedDays[0].id)
  }, [sortedDays, activeDay])

  // Areas that have sessions on the active day (or all areas — show all, even if empty)
  const dayAreaSessions = areaSessions.filter(s => s.day_id === activeDay)

  async function deleteArea(area) {
    if (!confirm(`Delete area "${area.name}"?\n\nAll sessions in this area will also be deleted.`)) return
    setDeleting(area.id)
    const { error } = await supabase.from('areas').delete().eq('id', area.id)
    if (error) toast('Error', error.message, 'danger')
    else { toast('Area deleted', area.name, 'success'); reload() }
    setDeleting(null)
  }

  async function deleteAreaSession(session) {
    if (!confirm(`Delete "${session.name}"?`)) return
    setDeleting(session.id)
    const { error } = await supabase.from('area_sessions').delete().eq('id', session.id)
    if (error) toast('Error', error.message, 'danger')
    else { toast('Session deleted', session.name, 'success'); reload() }
    setDeleting(null)
  }

  // Resolve the timing label for an area session
  function timingLabel(session) {
    const start = areaStart(session, onTrack)
    const end   = areaEnd(session, onTrack)
    const slipped = isAreaSlipped(session, onTrack)

    if (start == null || end == null) return { text: '—', slipped: false }

    const startStr = fromMins(start)
    const endStr   = fromMins(end)
    const dur      = end - start

    return {
      text: `${startStr} → ${endStr} (${durStr(dur)})`,
      slipped,
    }
  }

  // Resolve the dependency description for display
  function depDescription(session) {
    const parts = []

    // Start dep
    if (session.dep_type === 'after' && session.dep_session_id) {
      const dep = onTrack.find(s => s.id === session.dep_session_id)
      if (dep) {
        const offset = session.dep_offset_mins || 0
        const label  = dep.category ? `${dep.category} — ${dep.name}` : dep.name
        parts.push(`Starts ${offset >= 0 ? offset + 'm after' : Math.abs(offset) + 'm before'} end of ${label}`)
      }
    } else if (session.dep_type === 'fixed' && session.start_mins != null) {
      parts.push(`Starts at ${fromMins(session.start_mins)}`)
    }

    // Finish dep
    if (session.fin_dep_type === 'duration') {
      parts.push(`Duration: ${durStr(session.duration_mins || 0)}`)
    } else if (session.fin_dep_session_id) {
      const dep = onTrack.find(s => s.id === session.fin_dep_session_id)
      if (dep) {
        const offset   = session.fin_dep_offset_mins || 0
        const moment   = session.fin_dep_type === 'otStart' ? 'start' : 'end'
        const label    = dep.category ? `${dep.category} — ${dep.name}` : dep.name
        parts.push(`Ends ${offset >= 0 ? offset + 'm after' : Math.abs(offset) + 'm before'} ${moment} of ${label}`)
      }
    }

    return parts.join(' · ')
  }

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
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAddArea(true)}>
            + Add Area
          </button>
        )}
      </div>

      {/* ── No days ── */}
      {sortedDays.length === 0 && (
        <div className="empty">
          <div style={{ fontSize: 28, marginBottom: 10 }}>📅</div>
          No days set up yet. Add days in the Schedule view first.
        </div>
      )}

      {/* ── No areas ── */}
      {sortedDays.length > 0 && areas.length === 0 && (
        <div className="empty">
          <div style={{ fontSize: 28, marginBottom: 10 }}>🎪</div>
          No areas set up yet.
          {isOpsOrAbove && <><br />Click <strong>+ Add Area</strong> above to get started.</>}
        </div>
      )}

      {/* ── Area panels ── */}
      {activeDay && areas.map(area => {
        const sessions = dayAreaSessions
          .filter(s => s.area_id === area.id)
          .sort((a, b) => areaStart(a, onTrack) - areaStart(b, onTrack))

        return (
          <div key={area.id} style={areaCard(area.color)}>

            {/* Area header */}
            <div style={areaHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={colorDot(area.color)} />
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{area.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>({sessions.length})</span>
              </div>

              {isOpsOrAbove && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => setEditingArea(area)}
                  >Edit Area</button>
                  <button
                    className="btn btn-danger btn-xs"
                    onClick={() => deleteArea(area)}
                    disabled={deleting === area.id}
                  >Delete</button>
                  <button
                    className="btn btn-primary btn-xs"
                    onClick={() => setAddingSessionToArea(area)}
                  >+ Session</button>
                </div>
              )}
            </div>

            {/* Sessions */}
            {sessions.length === 0 ? (
              <div style={{ padding: '12px 0', color: 'var(--text-dim)', fontSize: 13 }}>
                No sessions on this day.
                {isOpsOrAbove && ' Click + Session to add one.'}
              </div>
            ) : (
              sessions.map(session => {
                const timing = timingLabel(session)
                const dep    = depDescription(session)

                return (
                  <div key={session.id} className={`session-item ${timing.slipped ? 'slipped' : ''}`}>

                    {/* Time */}
                    <div className={`s-time ${timing.slipped ? 'slipped' : ''}`}>
                      {timing.text}
                      {timing.slipped && (
                        <div style={{ fontSize: 10, color: 'var(--warning)', marginTop: 2 }}>
                          ↓ cascaded
                        </div>
                      )}
                    </div>

                    {/* Name + dep info */}
                    <div className="s-name" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{session.name}</span>
                      {dep && (
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>{dep}</span>
                      )}
                    </div>

                    {/* Actions */}
                    {isOpsOrAbove && (
                      <div className="s-actions">
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => setEditingAreaSession({ session, area })}
                        >Edit</button>
                        <button
                          className="btn btn-danger btn-xs"
                          onClick={() => deleteAreaSession(session)}
                          disabled={deleting === session.id}
                        >✕</button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )
      })}

      {/* ── Modals ── */}
      {(showAddArea || editingArea) && (
        <AddEditAreaModal
          area={editingArea}
          eventId={eventId}
          onClose={() => { setShowAddArea(false); setEditingArea(null) }}
          onSaved={() => { setShowAddArea(false); setEditingArea(null); reload() }}
        />
      )}

      {addingSessionToArea && (
        <AddEditAreaSessionModal
          session={null}
          areaId={addingSessionToArea.id}
          eventId={eventId}
          dayId={activeDay}
          days={sortedDays}
          onTrack={onTrack}
          onClose={() => setAddingSessionToArea(null)}
          onSaved={() => { setAddingSessionToArea(null); reload() }}
        />
      )}

      {editingAreaSession && (
        <AddEditAreaSessionModal
          session={editingAreaSession.session}
          areaId={editingAreaSession.area.id}
          eventId={eventId}
          dayId={activeDay}
          days={sortedDays}
          onTrack={onTrack}
          onClose={() => setEditingAreaSession(null)}
          onSaved={() => { setEditingAreaSession(null); reload() }}
        />
      )}
    </div>
  )
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function areaCard(color) {
  return {
    background: 'var(--surface)',
    border: `1px solid ${color}55`,
    borderLeft: `4px solid ${color}`,
    borderRadius: 10,
    padding: '14px 16px',
    marginBottom: 16,
  }
}

const areaHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 12,
  flexWrap: 'wrap',
  gap: 8,
}

function colorDot(color) {
  return {
    width: 12, height: 12,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }
}
