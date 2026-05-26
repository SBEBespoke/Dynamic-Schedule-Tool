import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useEvent } from '../../context/EventContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { fromMins, durStr, otStart, otEnd, otAdjusted } from '../../lib/time'
import { applyCascade, getCascadeUpdates } from '../../lib/cascade'

const QUICK_SLIPS = [5, 10, 15, 20]

export default function LiveUpdateView() {
  const { eventId, days, onTrack, slipLog, reload } = useEvent()
  const { user } = useAuth()
  const { toast } = useToast()

  const sortedDays = [...days].sort((a, b) => a.sort_order - b.sort_order)
  const [activeDay, setActiveDay] = useState(null)
  const [applying,  setApplying]  = useState(null) // session id being saved

  // Per-session local input state: { [sessionId]: { slipDelta: '', durOverride: '' } }
  const [inputs, setInputs] = useState({})

  useEffect(() => {
    if (sortedDays.length > 0 && !activeDay) setActiveDay(sortedDays[0].id)
  }, [sortedDays, activeDay])

  const daySessions = onTrack
    .filter(s => s.day_id === activeDay)
    .sort((a, b) => a.start_mins - b.start_mins)

  function getInput(id) {
    return inputs[id] || { slipDelta: '', durOverride: '' }
  }

  function setInput(id, key, val) {
    setInputs(prev => ({
      ...prev,
      [id]: { ...getInput(id), [key]: val },
    }))
  }

  // Apply a slip (either from quick button or custom input)
  async function applySlip(session, deltaMinutes) {
    const newSlip = (session.slip_mins || 0) + deltaMinutes
    if (newSlip < 0) { toast('Invalid', 'Slip cannot be negative', 'warn'); return }
    await saveChanges(session, newSlip, session.duration_override ?? null)
  }

  // Apply a duration override
  async function applyDurOverride(session) {
    const raw = getInput(session.id).durOverride
    const val = raw === '' ? null : parseInt(raw, 10)
    if (val !== null && (isNaN(val) || val < 1)) {
      toast('Invalid', 'Duration must be at least 1 minute', 'warn'); return
    }
    await saveChanges(session, session.slip_mins || 0, val)
  }

  // Core save: run cascade, batch-update DB, write slip log
  async function saveChanges(session, newSlipMins, newDurOverride) {
    setApplying(session.id)

    // Build the updated session object for cascade input
    const sessionWithOverride = { ...session, duration_override: newDurOverride }
    const allDaySessions = onTrack
      .filter(s => s.day_id === activeDay)
      .map(s => s.id === session.id ? sessionWithOverride : s)

    // Run cascade engine
    const cascaded = applyCascade(allDaySessions, session.id, newSlipMins)
    const updates  = getCascadeUpdates(allDaySessions, cascaded)

    if (updates.length === 0) {
      setApplying(null)
      setInputs(prev => ({ ...prev, [session.id]: { slipDelta: '', durOverride: '' } }))
      return
    }

    // Update each changed session individually (avoids upsert inserting rows without event_id)
    const results = await Promise.all(
      updates.map(u =>
        supabase
          .from('on_track_sessions')
          .update({
            slip_mins:         u.slip_mins,
            cascade_slip_mins: u.cascade_slip_mins,
            duration_override: u.duration_override,
          })
          .eq('id', u.id)
      )
    )
    const updateError = results.find(r => r.error)?.error

    if (updateError) {
      toast('Error', updateError.message, 'danger')
      setApplying(null)
      return
    }

    // Write slip log entry for the target session
    const slipDelta = newSlipMins - (session.slip_mins || 0)
    if (slipDelta !== 0 || newDurOverride !== (session.duration_override ?? null)) {
      const logNote = buildLogNote(session, slipDelta, newDurOverride)
      await supabase.from('slip_log').insert([{
        event_id:        eventId,
        session_id:      session.id,
        day_id:          session.day_id,
        session_name:    session.category ? `${session.category} — ${session.name}` : session.name,
        added_mins:      slipDelta,
        total_slip_mins: newSlipMins,
        note:            logNote,
        operator_id:     user?.id || null,
      }])
    }

    toast(
      slipDelta > 0 ? `+${slipDelta}m slip applied` : slipDelta < 0 ? `${slipDelta}m recovered` : 'Duration updated',
      session.category ? `${session.category} — ${session.name}` : session.name,
      'success'
    )

    setInputs(prev => ({ ...prev, [session.id]: { slipDelta: '', durOverride: '' } }))
    setApplying(null)
    reload()
  }

  // Reset a session back to scheduled times
  async function resetSession(session) {
    if (!confirm(`Reset "${session.name}" to its scheduled time?\nThis will clear all slips and duration overrides.`)) return
    setApplying(session.id)

    const allDaySessions = onTrack.filter(s => s.day_id === activeDay)
    const cascaded = applyCascade(allDaySessions, session.id, 0)
    // Also clear duration override on the target
    const updates = getCascadeUpdates(
      allDaySessions,
      cascaded.map(s => s.id === session.id ? { ...s, duration_override: null } : s)
    )

    // Force include the target even if cascade didn't change anything
    const targetIncluded = updates.some(u => u.id === session.id)
    if (!targetIncluded) {
      updates.push({ id: session.id, slip_mins: 0, cascade_slip_mins: 0, duration_override: null })
    }

    const resetResults = await Promise.all(
      updates.map(u =>
        supabase
          .from('on_track_sessions')
          .update({
            slip_mins:         u.slip_mins,
            cascade_slip_mins: u.cascade_slip_mins,
            duration_override: u.duration_override,
          })
          .eq('id', u.id)
      )
    )
    const error = resetResults.find(r => r.error)?.error
    if (error) toast('Error', error.message, 'danger')
    else {
      await supabase.from('slip_log').insert([{
        event_id:        eventId,
        session_id:      session.id,
        day_id:          session.day_id,
        session_name:    session.category ? `${session.category} — ${session.name}` : session.name,
        added_mins:      -(session.slip_mins || 0),
        total_slip_mins: 0,
        note:            'Reset to scheduled time',
        operator_id:     user?.id || null,
      }])
      toast('Reset', session.name, 'success')
      reload()
    }
    setApplying(null)
  }

  // Day slip log (most recent first, limited to this day's sessions)
  const daySessionIds = new Set(daySessions.map(s => s.id))
  const dayLog = slipLog.filter(l => daySessionIds.has(l.session_id))

  return (
    <div>
      {/* ── Day tabs ── */}
      <div className="day-tabs" style={{ marginBottom: 20 }}>
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

      {daySessions.length === 0 && (
        <div className="empty">No sessions on this day.</div>
      )}

      {/* ── Session slip controls ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
        {daySessions.map(session => {
          const adjusted   = otAdjusted(session)
          const startDisp  = otStart(session)
          const endDisp    = otEnd(session)
          const slip       = session.slip_mins || 0
          const cascade    = session.cascade_slip_mins || 0
          const totalSlip  = slip + cascade
          const inp        = getInput(session.id)
          const isApplying = applying === session.id

          return (
            <div key={session.id} style={sessionRow(adjusted)}>

              {/* ── Left: timing ── */}
              <div style={timingBlock}>
                <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: adjusted ? 'var(--warning)' : 'var(--text)' }}>
                  {fromMins(startDisp)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>→ {fromMins(endDisp)}</div>
                {adjusted && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                    was {fromMins(session.start_mins)}
                  </div>
                )}
              </div>

              {/* ── Centre: name + slip badges ── */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {session.category || 'General'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>{session.name}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {slip !== 0 && (
                    <span className="slip-pill">{slip > 0 ? '+' : ''}{slip}m manual</span>
                  )}
                  {cascade > 0 && (
                    <span className="slip-pill cascade" title="Auto-cascaded from upstream">↓ +{cascade}m cascade</span>
                  )}
                  {session.duration_override != null && (
                    <span style={durationBadge}>
                      ⏱ {durStr(session.duration_override)} (was {durStr(session.duration_mins)})
                    </span>
                  )}
                  {session.must_start_at != null && (
                    <span style={constraintBadge('#e8b000')}>🔒 pinned {fromMins(session.must_start_at)}</span>
                  )}
                  {session.must_finish_by != null && (
                    <span style={constraintBadge('#f97316')}>⏱ by {fromMins(session.must_finish_by)}</span>
                  )}
                </div>
              </div>

              {/* ── Right: controls ── */}
              <div style={controlsBlock}>
                {/* Quick slip buttons */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  {QUICK_SLIPS.map(d => (
                    <button
                      key={d}
                      className="btn btn-warning btn-xs"
                      disabled={isApplying || !!applying}
                      onClick={() => applySlip(session, d)}
                    >
                      +{d}m
                    </button>
                  ))}
                  {/* Custom slip input */}
                  <input
                    type="number"
                    placeholder="±min"
                    value={inp.slipDelta}
                    onChange={e => setInput(session.id, 'slipDelta', e.target.value)}
                    style={smallInput}
                  />
                  <button
                    className="btn btn-warning btn-xs"
                    disabled={!inp.slipDelta || isApplying || !!applying}
                    onClick={() => {
                      const delta = parseInt(inp.slipDelta, 10)
                      if (!isNaN(delta)) applySlip(session, delta)
                    }}
                  >
                    Apply
                  </button>
                </div>

                {/* Duration override */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Dur override:</span>
                  <input
                    type="number"
                    placeholder={session.duration_mins}
                    value={inp.durOverride}
                    onChange={e => setInput(session.id, 'durOverride', e.target.value)}
                    style={smallInput}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>min</span>
                  <button
                    className="btn btn-ghost btn-xs"
                    disabled={!inp.durOverride || isApplying || !!applying}
                    onClick={() => applyDurOverride(session)}
                  >Set</button>
                  {session.duration_override != null && (
                    <button
                      className="btn btn-ghost btn-xs"
                      disabled={isApplying || !!applying}
                      onClick={() => saveChanges(session, session.slip_mins || 0, null)}
                    >Clear</button>
                  )}
                </div>

                {/* Reset — only on manually slipped or duration-overridden sessions.
                    Cascade-only sessions cannot be reset independently; reset the upstream source. */}
                {(slip !== 0 || session.duration_override != null) && (
                  <div style={{ marginTop: 6 }}>
                    <button
                      className="btn btn-ghost btn-xs"
                      style={{ color: 'var(--text-dim)' }}
                      disabled={isApplying || !!applying}
                      onClick={() => resetSession(session)}
                    >
                      ↺ Reset to scheduled
                    </button>
                  </div>
                )}
                {/* Explain why cascaded sessions can't be reset here */}
                {slip === 0 && cascade > 0 && session.duration_override == null && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
                    ↑ Reset the session above that caused this cascade
                  </div>
                )}

                {isApplying && (
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>Applying…</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Slip log ── */}
      {dayLog.length > 0 && (
        <>
          <div className="sec-header" style={{ marginBottom: 12 }}>
            <span className="sec-title">Slip Log</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{dayLog.length} entr{dayLog.length === 1 ? 'y' : 'ies'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dayLog.map(entry => (
              <div key={entry.id} style={logRow}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {formatLogTime(entry.created_at)}
                </div>
                <div style={{ flex: 1, fontSize: 13 }}>
                  <strong>{entry.session_name}</strong>
                  {entry.note && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}> — {entry.note}</span>}
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 700,
                  color: entry.added_mins > 0 ? 'var(--warning)' : entry.added_mins < 0 ? 'var(--success)' : 'var(--text-dim)',
                  whiteSpace: 'nowrap',
                }}>
                  {entry.added_mins > 0 ? `+${entry.added_mins}m` : entry.added_mins < 0 ? `${entry.added_mins}m` : '—'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildLogNote(session, slipDelta, newDurOverride) {
  const parts = []
  if (slipDelta !== 0) parts.push(`${slipDelta > 0 ? '+' : ''}${slipDelta}m slip`)
  if (newDurOverride != null && newDurOverride !== session.duration_mins) {
    parts.push(`duration set to ${newDurOverride}m`)
  }
  if (newDurOverride === null && session.duration_override != null) {
    parts.push('duration reset')
  }
  return parts.join(', ')
}

function formatLogTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// ── Styles ────────────────────────────────────────────────────────────────────

function sessionRow(adjusted) {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
    background: adjusted ? 'rgba(249,115,22,0.05)' : 'var(--surface)',
    border: `1px solid ${adjusted ? 'rgba(249,115,22,0.3)' : 'var(--border)'}`,
    borderLeft: `4px solid ${adjusted ? 'var(--warning)' : 'var(--border)'}`,
    borderRadius: 10,
    padding: '12px 16px',
    flexWrap: 'wrap',
  }
}

const timingBlock = {
  minWidth: 70,
  textAlign: 'right',
  flexShrink: 0,
}

const controlsBlock = {
  flexShrink: 0,
  minWidth: 280,
}

const smallInput = {
  width: 64,
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: 4,
  padding: '3px 6px',
  fontSize: 12,
  textAlign: 'center',
}

const durationBadge = {
  fontSize: 11,
  color: '#60a5fa',
  background: 'rgba(96,165,250,0.1)',
  border: '1px solid rgba(96,165,250,0.25)',
  borderRadius: 4,
  padding: '2px 7px',
}

function constraintBadge(color) {
  return {
    fontSize: 11, color,
    background: `${color}18`,
    border: `1px solid ${color}44`,
    borderRadius: 4,
    padding: '2px 7px',
  }
}

const logRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 7,
  padding: '8px 14px',
}
