import { useMemo } from 'react'
import { useEvent } from '../../context/EventContext'
import { useAuth } from '../../context/AuthContext'
import { fromMins, durStr } from '../../lib/time'
import { areaStart, areaEnd } from '../../lib/conflicts'

// Read-only personal schedule for the logged-in user.
// Matches by user_profile.id — the person record must have the same id as the auth user.
export default function MyScheduleView() {
  const { days, onTrack, areas, areaSessions, people } = useEvent()
  const { profile } = useAuth()

  const sortedDays = [...days].sort((a, b) => a.sort_order - b.sort_order)

  // Find the person record linked to the logged-in user's account
  const me = useMemo(
    () => people.find(p => p.linked_user_id === profile?.id),
    [people, profile]
  )

  // Build a flat list of assigned sessions for the current user
  const myAssignments = useMemo(() => {
    if (!me) return []

    const result = []

    // On-track sessions
    const otIds = (me.people_on_track || []).map(r => r.session_id)
    otIds.forEach(id => {
      const s = onTrack.find(x => x.id === id)
      if (!s) return
      result.push({
        id:      s.id,
        dayId:   s.day_id,
        type:    'ontrack',
        label:   s.category ? `${s.category} — ${s.name}` : s.name,
        start:   s.start_mins + (s.slip_mins || 0) + (s.cascade_slip_mins || 0),
        end:     s.start_mins + (s.slip_mins || 0) + (s.cascade_slip_mins || 0) + (s.duration_override ?? s.duration_mins),
        slipped: (s.slip_mins || 0) !== 0 || (s.cascade_slip_mins || 0) !== 0 || s.duration_override != null,
        notes:   s.notes || null,
        radio:   me.radio_channel || null,
        color:   null,
      })
    })

    // Area sessions
    const asIds = (me.people_area_sessions || []).map(r => r.area_session_id)
    asIds.forEach(id => {
      const s = areaSessions.find(x => x.id === id)
      if (!s) return
      const area = areas.find(a => a.id === s.area_id)
      result.push({
        id:      s.id,
        dayId:   s.day_id,
        type:    'area',
        label:   area ? `${area.name} — ${s.name}` : s.name,
        start:   areaStart(s, onTrack),
        end:     areaEnd(s, onTrack),
        slipped: false, // area sessions reflect cascade automatically
        notes:   null,
        radio:   me.radio_channel || null,
        color:   area?.color || null,
      })
    })

    return result
  }, [me, onTrack, areaSessions, areas])

  // If the user has no matching person record
  if (!me) {
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📱</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
          No schedule found
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          Your account hasn't been linked to a team member record yet.
          <br />Ask an ops lead to add you to the People list.
        </div>
      </div>
    )
  }

  if (myAssignments.length === 0) {
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📱</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
          No sessions assigned yet
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          Your schedule will appear here once sessions have been assigned to you.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Personal header */}
      <div style={personalHeader}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{me.name}</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
            {me.phone_whatsapp && (
              <span style={metaItem}>📱 {me.phone_whatsapp}</span>
            )}
            {me.radio_channel && (
              <span style={metaItem}>📻 {me.radio_channel}</span>
            )}
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          {myAssignments.length} session{myAssignments.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Sessions grouped by day */}
      {sortedDays.map(day => {
        const daySessions = myAssignments
          .filter(s => s.dayId === day.id)
          .sort((a, b) => a.start - b.start)

        if (daySessions.length === 0) return null

        return (
          <div key={day.id} style={{ marginBottom: 28 }}>
            <div style={dayHeader}>{day.name}</div>

            {daySessions.map(s => (
              <div
                key={s.id}
                className={`session-item ${s.slipped ? 'slipped' : ''}`}
                style={s.color ? { borderLeft: `4px solid ${s.color}` } : {}}
              >
                {/* Time block */}
                <div className={`s-time ${s.slipped ? 'slipped' : ''}`}>
                  <div style={{ fontWeight: 700 }}>{fromMins(s.start)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
                    → {fromMins(s.end)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    {durStr(s.end - s.start)}
                  </div>
                  {s.slipped && (
                    <div style={{ fontSize: 9, color: 'var(--warning)', marginTop: 2, fontWeight: 700 }}>
                      UPDATED
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="s-name" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.label}</div>
                  {s.notes && (
                    <div style={notesStyle}>{s.notes}</div>
                  )}
                  {s.radio && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>📻 {s.radio}</div>
                  )}
                </div>

                {/* Type badge */}
                <div style={typeBadge(s.type)}>
                  {s.type === 'ontrack' ? 'On-Track' : 'Activation'}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const personalHeader = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '16px 18px',
  marginBottom: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 10,
}

const metaItem = {
  fontSize: 12,
  color: 'var(--text-mid)',
}

const dayHeader = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '1.2px',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  padding: '8px 0 6px',
  borderBottom: '1px solid var(--border)',
  marginBottom: 10,
}

const notesStyle = {
  fontSize: 12,
  color: 'var(--text-mid)',
  background: 'var(--surface)',
  borderRadius: 4,
  padding: '5px 8px',
  borderLeft: '3px solid var(--accent)',
}

function typeBadge(type) {
  const isOT = type === 'ontrack'
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: isOT ? 'var(--accent)' : 'var(--text-dim)',
    background: isOT ? 'rgba(99,102,241,0.1)' : 'var(--surface)',
    border: `1px solid ${isOT ? 'rgba(99,102,241,0.25)' : 'var(--border)'}`,
    borderRadius: 4,
    padding: '2px 7px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    alignSelf: 'flex-start',
  }
}
