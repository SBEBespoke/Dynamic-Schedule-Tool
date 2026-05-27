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
  const { eventId, days, onTrack, areas, areaSessions, people, reload } = useEvent()
  const { isOpsOrAbove, isSuperAdmin, profile } = useAuth()
  const { toast } = useToast()

  const me = people.find(p => p.linked_user_id === profile?.id)
  const [joining, setJoining] = useState(null)

  async function toggleJoinArea(session) {
    if (!me) return
    setJoining(session.id)
    const isJoined = me.people_area_sessions?.some(pas => pas.area_session_id === session.id)
    if (isJoined) {
      await supabase.from('people_area_sessions').delete().eq('person_id', me.id).eq('area_session_id', session.id)
    } else {
      const { error } = await supabase.from('people_area_sessions').insert([{ person_id: me.id, area_session_id: session.id }])
      if (error) toast('Error', error.message, 'danger')
    }
    setJoining(null)
    reload()
  }

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

      {/* ── Area columns ── */}
      {activeDay && (
        <div className="activations-grid" style={columnsGrid}>
          {areas.map(area => {
            const sessions = dayAreaSessions
              .filter(s => s.area_id === area.id)
              .sort((a, b) => areaStart(a, onTrack) - areaStart(b, onTrack))

            return (
              <div key={area.id} style={areaCard(area.color)}>

                {/* Area header */}
                <div style={areaHeaderStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={colorDot(area.color)} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{area.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>({sessions.length})</span>
                  </div>

                  {isOpsOrAbove && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => setEditingArea(area)}
                      >Edit</button>
                      {isSuperAdmin && (
                        <button
                          className="btn btn-danger btn-xs"
                          onClick={() => deleteArea(area)}
                          disabled={deleting === area.id}
                        >✕</button>
                      )}
                    </div>
                  )}
                </div>

                {/* Add session button */}
                {isOpsOrAbove && (
                  <button
                    className="btn btn-ghost btn-xs"
                    style={{ width: '100%', marginBottom: 10, borderStyle: 'dashed' }}
                    onClick={() => setAddingSessionToArea(area)}
                  >+ Add Session</button>
                )}

                {/* Sessions */}
                {sessions.length === 0 ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '4px 0' }}>
                    No sessions on this day.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sessions.map(session => {
                      const timing = timingLabel(session)
                      const dep    = depDescription(session)

                      return (
                        <div key={session.id} style={sessionCard(timing.slipped)}>

                          {/* Time */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: timing.slipped ? 'var(--warning)' : 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                              {timing.text}
                            </div>
                            {timing.slipped && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--warning)', letterSpacing: '0.5px' }}>↓ SLIP</span>
                            )}
                          </div>

                          {/* Name */}
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: dep ? 4 : 0 }}>
                            {session.name}
                          </div>

                          {/* Dep description */}
                          {dep && (
                            <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                              {dep}
                            </div>
                          )}

                          {/* Join / Leave */}
                          <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                            {me && (
                              <button
                                className={`btn btn-xs ${me.people_area_sessions?.some(pas => pas.area_session_id === session.id) ? 'btn-warning' : 'btn-ghost'}`}
                                disabled={joining === session.id}
                                onClick={() => toggleJoinArea(session)}
                              >
                                {me.people_area_sessions?.some(pas => pas.area_session_id === session.id) ? '✓ Joined' : '+ Join'}
                              </button>
                            )}

                            {/* Actions — ops+ edit, admin delete */}
                            {isOpsOrAbove && (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  className="btn btn-ghost btn-xs"
                                  onClick={() => setEditingAreaSession({ session, area })}
                                >Edit</button>
                                {isSuperAdmin && (
                                  <button
                                    className="btn btn-danger btn-xs"
                                    onClick={() => deleteAreaSession(session)}
                                    disabled={deleting === session.id}
                                  >✕</button>
                                )}
                              </div>
                            )}
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
      )}

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

const columnsGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 12,
  alignItems: 'start',
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

const areaHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
  gap: 6,
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
