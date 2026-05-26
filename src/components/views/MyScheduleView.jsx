import { useMemo } from 'react'
import { useEvent } from '../../context/EventContext'
import { useAuth } from '../../context/AuthContext'
import { fromMins, durStr, otStart, otEnd } from '../../lib/time'
import { areaStart, areaEnd, isAreaSlipped } from '../../lib/conflicts'

export default function MyScheduleView() {
  const { days, onTrack, areas, areaSessions, people } = useEvent()
  const { profile } = useAuth()

  const sortedDays = [...days].sort((a, b) => a.sort_order - b.sort_order)

  const me = useMemo(
    () => people.find(p => p.linked_user_id === profile?.id),
    [people, profile]
  )

  const myAssignments = useMemo(() => {
    if (!me) return []
    const result = []

    // On-track sessions
    const otIds = (me.people_on_track || []).map(r => r.session_id)
    otIds.forEach(id => {
      const s = onTrack.find(x => x.id === id)
      if (!s) return
      const slipMins    = (s.slip_mins || 0) + (s.cascade_slip_mins || 0)
      const slipped     = slipMins !== 0 || s.duration_override != null
      const scheduledStart = s.start_mins
      const scheduledEnd   = s.start_mins + s.duration_mins
      result.push({
        id:             s.id,
        dayId:          s.day_id,
        type:           'ontrack',
        label:          s.category ? `${s.category} — ${s.name}` : s.name,
        start:          otStart(s),
        end:            otEnd(s),
        scheduledStart,
        scheduledEnd,
        slipped,
        slipMins,       // total minutes late (for badge)
        notes:          s.notes || null,
        radio:          me.radio_channel || null,
        color:          null,
      })
    })

    // Area sessions
    const asIds = (me.people_area_sessions || []).map(r => r.area_session_id)
    asIds.forEach(id => {
      const s = areaSessions.find(x => x.id === id)
      if (!s) return
      const area    = areas.find(a => a.id === s.area_id)
      const slipped = isAreaSlipped(s, onTrack)

      // Compute what the times would be with no slips (for "was" display)
      const frozenOT = onTrack.map(ot => ({ ...ot, slip_mins: 0, cascade_slip_mins: 0, duration_override: null }))
      const scheduledStart = areaStart(s, frozenOT)
      const scheduledEnd   = areaEnd(s, frozenOT)
      const actualStart    = areaStart(s, onTrack)
      const actualEnd      = areaEnd(s, onTrack)
      const slipMins       = slipped ? (actualStart - scheduledStart) : 0

      result.push({
        id:             s.id,
        dayId:          s.day_id,
        type:           'area',
        label:          area ? `${area.name} — ${s.name}` : s.name,
        start:          actualStart,
        end:            actualEnd,
        scheduledStart,
        scheduledEnd,
        slipped,
        slipMins,
        notes:          null,
        radio:          me.radio_channel || null,
        color:          area?.color || null,
      })
    })

    return result
  }, [me, onTrack, areaSessions, areas])

  if (!me) {
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📱</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>No schedule found</div>
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
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>No sessions assigned yet</div>
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          Your schedule will appear here once sessions have been assigned to you.
        </div>
      </div>
    )
  }

  const slippedCount = myAssignments.filter(s => s.slipped).length

  return (
    <div>
      {/* Personal header */}
      <div style={personalHeader}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{me.name}</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
            {me.phone_whatsapp && <span style={metaItem}>📱 {me.phone_whatsapp}</span>}
            {me.radio_channel  && <span style={metaItem}>📻 {me.radio_channel}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            {myAssignments.length} session{myAssignments.length !== 1 ? 's' : ''}
          </div>
          {slippedCount > 0 && (
            <div style={slipAlertBanner}>
              ⚠ {slippedCount} session{slippedCount > 1 ? 's' : ''} updated
            </div>
          )}
        </div>
      </div>

      {/* Sessions by day */}
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
                style={sessionCard(s.slipped, s.color)}
              >
                {/* Time block */}
                <div style={timeBlock(s.slipped)}>
                  {/* Current (adjusted) time — prominent */}
                  <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {fromMins(s.start)}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 1 }}>
                    → {fromMins(s.end)}
                  </div>
                  <div style={{ fontSize: 10, color: s.slipped ? 'rgba(249,115,22,0.7)' : 'var(--text-dim)', marginTop: 1 }}>
                    {durStr(s.end - s.start)}
                  </div>

                  {/* Original time — shown only when slipped */}
                  {s.slipped && s.scheduledStart !== s.start && (
                    <div style={wasTime}>
                      was {fromMins(s.scheduledStart)}
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="s-name" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.label}</div>

                  {/* Slip badge */}
                  {s.slipped && s.slipMins !== 0 && (
                    <div style={slipBadge}>
                      ⚠ Running {s.slipMins > 0 ? `+${s.slipMins}m late` : `${Math.abs(s.slipMins)}m early`}
                    </div>
                  )}

                  {s.notes && <div style={notesStyle}>{s.notes}</div>}
                  {s.radio  && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>📻 {s.radio}</div>}
                </div>

                {/* Type badge */}
                <div style={typeBadge(s.type, s.slipped)}>
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

const metaItem = { fontSize: 12, color: 'var(--text-mid)' }

const slipAlertBanner = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--warning)',
  background: 'rgba(249,115,22,0.12)',
  border: '1px solid rgba(249,115,22,0.35)',
  borderRadius: 6,
  padding: '4px 10px',
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

function sessionCard(slipped, areaColor) {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    background: slipped ? 'rgba(249,115,22,0.07)' : 'var(--surface)',
    border: `1px solid ${slipped ? 'rgba(249,115,22,0.4)' : 'var(--border)'}`,
    borderLeft: `4px solid ${slipped ? 'var(--warning)' : (areaColor || 'var(--border)')}`,
    borderRadius: 10,
    padding: '12px 14px',
    marginBottom: 8,
    transition: 'border-color 0.2s, background 0.2s',
  }
}

function timeBlock(slipped) {
  return {
    minWidth: 64,
    flexShrink: 0,
    color: slipped ? 'var(--warning)' : 'var(--text)',
    textAlign: 'right',
  }
}

const wasTime = {
  fontSize: 10,
  color: 'var(--text-dim)',
  textDecoration: 'line-through',
  marginTop: 3,
  fontVariantNumeric: 'tabular-nums',
}

const slipBadge = {
  display: 'inline-block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--warning)',
  background: 'rgba(249,115,22,0.12)',
  border: '1px solid rgba(249,115,22,0.3)',
  borderRadius: 4,
  padding: '2px 8px',
}

const notesStyle = {
  fontSize: 12,
  color: 'var(--text-mid)',
  background: 'var(--surface)',
  borderRadius: 4,
  padding: '5px 8px',
  borderLeft: '3px solid var(--accent)',
}

function typeBadge(type, slipped) {
  const isOT = type === 'ontrack'
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: slipped ? 'var(--warning)' : isOT ? 'var(--accent)' : 'var(--text-dim)',
    background: slipped ? 'rgba(249,115,22,0.1)' : isOT ? 'rgba(99,102,241,0.1)' : 'var(--surface)',
    border: `1px solid ${slipped ? 'rgba(249,115,22,0.3)' : isOT ? 'rgba(99,102,241,0.25)' : 'var(--border)'}`,
    borderRadius: 4,
    padding: '2px 7px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    alignSelf: 'flex-start',
  }
}
