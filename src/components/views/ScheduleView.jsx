import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useEvent } from '../../context/EventContext'
import { useAuth } from '../../context/AuthContext'
import { useViewAuth } from '../../context/ViewContext'
import { useToast } from '../../context/ToastContext'
import { fromMins, durStr, otStart, otEnd, otAdjusted } from '../../lib/time'
import { useWeather, precipEmoji, precipColor } from '../../lib/useWeather'
import { applyCascade, getCascadeUpdates } from '../../lib/cascade'
import AddEditSessionModal from '../modals/AddEditSessionModal'
import AddEditDayModal    from '../modals/AddEditDayModal'
import WeatherWidget      from '../WeatherWidget'

const QUICK_SLIPS = [5, 10, 15, 20]

export default function ScheduleView() {
  const { eventId, days, onTrack, areaSessions, people, reload } = useEvent()
  const { getWeather, getDayWeather, dateInWindow } = useWeather(days)
  const { profile, user } = useAuth()
  const { effectiveIsOpsOrAbove: isOpsOrAbove, effectiveIsSuperAdmin: isSuperAdmin } = useViewAuth()
  const { toast } = useToast()

  const me = people.find(p => p.linked_user_id === profile?.id)

  const [activeDay,      setActiveDay]      = useState(null)
  const [showAddSession, setShowAddSession] = useState(false)
  const [editingSession, setEditingSession] = useState(null)
  const [showAddDay,     setShowAddDay]     = useState(false)
  const [editingDay,     setEditingDay]     = useState(null)
  const [deleting,       setDeleting]       = useState(null)
  const [joining,        setJoining]        = useState(null)
  const [applying,       setApplying]       = useState(null)

  // Per-session custom slip input: { [sessionId]: string }
  const [slipInputs, setSlipInputs] = useState({})

  function getSlipInput(id) { return slipInputs[id] ?? '' }
  function setSlipInput(id, val) { setSlipInputs(p => ({ ...p, [id]: val })) }

  // ── Core cascade-save with WhatsApp notifications ────────────────────────────
  async function saveSlip(session, newSlipMins) {
    if (newSlipMins < 0) { toast('Invalid', 'Slip cannot be negative', 'warn'); return }
    setApplying(session.id)

    const allDaySessions = onTrack.filter(s => s.day_id === activeDay)
    const cascaded = applyCascade(allDaySessions, session.id, newSlipMins)
    const updates  = getCascadeUpdates(allDaySessions, cascaded)

    if (updates.length === 0) { setApplying(null); setSlipInput(session.id, ''); return }

    const results = await Promise.all(
      updates.map(u =>
        supabase.from('on_track_sessions').update({
          slip_mins:         u.slip_mins,
          cascade_slip_mins: u.cascade_slip_mins,
          duration_override: u.duration_override,
        }).eq('id', u.id)
      )
    )
    const err = results.find(r => r.error)?.error
    if (err) {
      toast('Error', err.message, 'danger')
      setApplying(null)
      return
    }

    const slipDelta = newSlipMins - (session.slip_mins || 0)
    const label = session.category ? `${session.category} — ${session.name}` : session.name

    // Write slip log entry
    await supabase.from('slip_log').insert([{
      event_id:        eventId,
      session_id:      session.id,
      day_id:          session.day_id,
      session_name:    label,
      added_mins:      slipDelta,
      total_slip_mins: newSlipMins,
      note:            slipDelta >= 0 ? `+${slipDelta}m slip (schedule edit)` : `${slipDelta}m reduction (schedule edit)`,
      operator_id:     user?.id || null,
    }])

    // ── WhatsApp notifications ────────────────────────────────────────────────
    if (slipDelta !== 0 && updates.length > 0) {
      const changedIds  = new Set(updates.map(u => u.id))
      const cascadedMap = new Map(cascaded.map(s => [s.id, s]))
      const dayName     = sortedDays.find(d => d.id === activeDay)?.name || ''

      // Activations whose start is driven by a changed on-track session
      const affectedAreas   = areaSessions.filter(as =>
        as.dep_type === 'after' && changedIds.has(as.dep_session_id)
      )
      const affectedAreaIds = new Set(affectedAreas.map(as => as.id))
      const affectedAreaMap = new Map(affectedAreas.map(as => [as.id, as]))

      const notifications = []
      for (const person of people) {
        if (!person.phone_whatsapp) continue

        // On-track sessions this person is assigned to that moved
        const onTrackLines = (person.people_on_track || [])
          .filter(pot => changedIds.has(pot.session_id))
          .map(pot => {
            const s        = cascadedMap.get(pot.session_id)
            if (!s) return null
            const newStart = s.start_mins + (s.slip_mins || 0) + (s.cascade_slip_mins || 0)
            const sOrig    = onTrack.find(o => o.id === pot.session_id)
            const oldStart = sOrig
              ? sOrig.start_mins + (sOrig.slip_mins || 0) + (sOrig.cascade_slip_mins || 0)
              : null
            const sessionLabel = s.category ? `${s.category} — ${s.name}` : s.name
            const timeStr  = oldStart != null && oldStart !== newStart
              ? `${fromMins(oldStart)} → ${fromMins(newStart)}`
              : fromMins(newStart)
            return `• ${sessionLabel}: ${timeStr}`
          })
          .filter(Boolean)

        // Activations this person is assigned to that moved
        const areaLines = (person.people_area_sessions || [])
          .filter(pas => affectedAreaIds.has(pas.area_session_id))
          .map(pas => {
            const as     = affectedAreaMap.get(pas.area_session_id)
            const linked = cascadedMap.get(as.dep_session_id)
            if (linked) {
              const linkedNewStart = linked.start_mins + (linked.slip_mins || 0) + (linked.cascade_slip_mins || 0)
              const linkedDur      = linked.duration_override ?? linked.duration_mins
              const linkedNewEnd   = linkedNewStart + linkedDur
              const newStart       = linkedNewEnd + (as.dep_offset_mins || 0)
              const linkedOrig     = onTrack.find(o => o.id === linked.id)
              let oldStart = null
              if (linkedOrig) {
                const linkedOldStart = linkedOrig.start_mins + (linkedOrig.slip_mins || 0) + (linkedOrig.cascade_slip_mins || 0)
                const linkedOldDur   = linkedOrig.duration_override ?? linkedOrig.duration_mins
                oldStart = linkedOldStart + linkedOldDur + (as.dep_offset_mins || 0)
              }
              const timeStr = oldStart != null && oldStart !== newStart
                ? `${fromMins(oldStart)} → ${fromMins(newStart)}`
                : fromMins(newStart)
              return `• ${as.name}: ${timeStr}`
            }
            return `• ${as.name}: ${fromMins(as.start_mins)}`
          })

        const allLines = [...onTrackLines, ...areaLines]
        if (allLines.length > 0) notifications.push({ person, allLines })
      }

      for (const { person, allLines } of notifications) {
        const message = slipDelta > 0
          ? `⚠️ *Schedule Update — ADL Grand Final*\n\nThe following sessions on your schedule have moved:\n\n${allLines.join('\n')}\n\n📅 ${dayName}`
          : `✅ *Schedule Recovery — ADL Grand Final*\n\nThe following sessions on your schedule have been updated:\n\n${allLines.join('\n')}\n\n📅 ${dayName}`

        supabase.functions.invoke('send-whatsapp', {
          body: { recipients: [{ name: person.name, phone: person.phone_whatsapp }], message },
        }).catch(err => console.warn('WhatsApp notify failed:', err))
      }
    }

    toast(
      slipDelta > 0 ? `+${slipDelta}m slip applied` : slipDelta < 0 ? `${slipDelta}m recovered` : 'Updated',
      label,
      'success'
    )

    setApplying(null)
    setSlipInput(session.id, '')
    reload()
  }

  async function applyQuickSlip(session, delta) {
    await saveSlip(session, (session.slip_mins || 0) + delta)
  }

  async function applyCustomSlip(session) {
    const raw = getSlipInput(session.id)
    const val = parseInt(raw, 10)
    if (!raw || isNaN(val)) return
    // Treat as an absolute value if user types "10" (add), or relative if they type "+10"/"-5"
    const abs = raw.startsWith('+') || raw.startsWith('-')
      ? (session.slip_mins || 0) + val
      : val
    await saveSlip(session, abs)
  }

  async function resetSlip(session) {
    await saveSlip(session, 0)
  }

  async function toggleJoin(s) {
    if (!me) return
    setJoining(s.id)
    const isJoined = me.people_on_track?.some(pot => pot.session_id === s.id)
    if (isJoined) {
      await supabase.from('people_on_track').delete().eq('person_id', me.id).eq('session_id', s.id)
    } else {
      const { error } = await supabase.from('people_on_track').insert([{ person_id: me.id, session_id: s.id }])
      if (error) toast('Error', error.message, 'danger')
    }
    setJoining(null)
    reload()
  }

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
      <WeatherWidget
        dayForecast={getDayWeather(activeDay_?.date)}
        dayName={activeDay_?.name}
      />
      {activeDay_?.date && !dateInWindow(activeDay_.date) && (
        <div style={{
          fontSize: 11, color: 'var(--text-dim)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 7, padding: '6px 12px', marginBottom: 14,
          display: 'inline-block',
        }}>
          🌡 Session forecasts will appear here within 16 days of the event
        </div>
      )}

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
                {isSuperAdmin && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => deleteDay(activeDay_)}
                    disabled={deleting === activeDay_?.id}
                  >
                    Delete Day
                  </button>
                )}
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
              const adjusted   = otAdjusted(s)
              const startDisp  = adjusted ? otStart(s) : s.start_mins
              const endDisp    = adjusted ? otEnd(s)   : s.start_mins + s.duration_mins
              const wx         = getWeather(activeDay_?.date, s.start_mins)
              const isApplying = applying === s.id
              const totalSlip  = (s.slip_mins || 0) + (s.cascade_slip_mins || 0)

              return (
                <div
                  key={s.id}
                  className={`session-item ${adjusted ? 'slipped' : ''}`}
                  style={{ flexWrap: 'wrap' }}
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

                  {/* Category (primary) + session name (support) + weather */}
                  <div className="s-name" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{s.category || 'General'}</span>
                      {s.notes && (
                        <span title={s.notes} style={{ fontSize: 11, color: 'var(--text-dim)', cursor: 'help' }}>📋</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>{s.name}</span>
                    {wx && (
                      <span style={{
                        fontSize: 11,
                        fontWeight: wx.precipProb >= 30 ? 700 : 400,
                        color: precipColor(wx.precipProb),
                        marginTop: 1,
                      }}>
                        {precipEmoji(wx.precipProb)} {wx.temp}°C
                        {wx.precipProb > 0 && (
                          <span> · {wx.precipProb}% rain{wx.precip > 0 ? ` (${wx.precip}mm)` : ''}</span>
                        )}
                      </span>
                    )}
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

                  {/* ── Inline slip controls (ops+ only) ── */}
                  {isOpsOrAbove && (
                    <div style={slipControls}>
                      {/* Quick-add buttons */}
                      {QUICK_SLIPS.map(delta => (
                        <button
                          key={delta}
                          className="btn btn-ghost btn-xs"
                          style={quickSlipBtn}
                          disabled={isApplying}
                          onClick={() => applyQuickSlip(s, delta)}
                          title={`Add ${delta} minute delay`}
                        >
                          +{delta}m
                        </button>
                      ))}

                      {/* Custom input */}
                      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                        <input
                          type="number"
                          placeholder="mins"
                          value={getSlipInput(s.id)}
                          onChange={e => setSlipInput(s.id, e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && applyCustomSlip(s)}
                          disabled={isApplying}
                          style={slipInput}
                          title="Enter total slip minutes (or +/-relative)"
                        />
                        <button
                          className="btn btn-ghost btn-xs"
                          disabled={isApplying || !getSlipInput(s.id)}
                          onClick={() => applyCustomSlip(s)}
                          style={{ padding: '3px 7px', fontSize: 11 }}
                        >
                          Set
                        </button>
                      </div>

                      {/* Reset — only shown when slipped */}
                      {totalSlip > 0 && (
                        <button
                          className="btn btn-ghost btn-xs"
                          style={{ color: 'var(--warning)', borderColor: 'rgba(249,115,22,0.4)', fontSize: 11 }}
                          disabled={isApplying}
                          onClick={() => resetSlip(s)}
                          title="Reset all slip to 0"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  )}

                  {/* Join / Leave — visible to anyone with a person record */}
                  {me && (
                    <button
                      className={`btn btn-xs ${me.people_on_track?.some(pot => pot.session_id === s.id) ? 'btn-warning' : 'btn-ghost'}`}
                      style={{ flexShrink: 0 }}
                      disabled={joining === s.id}
                      onClick={() => toggleJoin(s)}
                    >
                      {me.people_on_track?.some(pot => pot.session_id === s.id) ? '✓ Joined' : '+ Join'}
                    </button>
                  )}

                  {/* Actions — ops+ edit, admin delete */}
                  {isOpsOrAbove && (
                    <div className="s-actions">
                      <button className="btn btn-ghost btn-xs" onClick={() => setEditingSession(s)}>Edit</button>
                      {isSuperAdmin && (
                        <button
                          className="btn btn-danger btn-xs"
                          onClick={() => deleteSession(s)}
                          disabled={deleting === s.id}
                        >✕</button>
                      )}
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

// ── Slip control styles ───────────────────────────────────────────────────────

const slipControls = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
  // Full-width row below the main session content
  width: '100%',
  padding: '8px 0 2px',
  borderTop: '1px dashed var(--border)',
  marginTop: 6,
}

const quickSlipBtn = {
  fontSize: 11,
  padding: '3px 8px',
  color: 'var(--warning)',
  borderColor: 'rgba(249,115,22,0.4)',
  background: 'rgba(249,115,22,0.06)',
}

const slipInput = {
  width: 64,
  padding: '3px 6px',
  fontSize: 11,
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: 'var(--radius)',
}
