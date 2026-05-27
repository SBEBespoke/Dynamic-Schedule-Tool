import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useEvent } from '../../context/EventContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { fromMins, durStr, otStart, otEnd } from '../../lib/time'
import { areaStart, areaEnd, isAreaSlipped } from '../../lib/conflicts'

// ── Date-aware overdue check ──────────────────────────────────────────────────

// Returns true only if the day's calendar date is today or already in the past.
// Items on future days can never be overdue regardless of their due time.
function isDayOverduable(day) {
  if (!day?.date) return true // no date set — fall back to time-only check
  const today = new Date().toISOString().slice(0, 10) // 'YYYY-MM-DD'
  return day.date <= today
}

// ── Due time helpers for checklist items ──────────────────────────────────────

function getDueMins(item, onTrack, areaSessions) {
  if (!item.dep_type || item.dep_type === 'fixed') return item.due_mins ?? null
  if (item.dep_type === 'on_track' && item.dep_on_track_id) {
    const s = onTrack.find(x => x.id === item.dep_on_track_id)
    if (!s) return null
    const base = item.dep_anchor === 'end' ? otEnd(s) : otStart(s)
    return base + (item.dep_offset_mins || 0)
  }
  if (item.dep_type === 'area_session' && item.dep_area_session_id) {
    const s = areaSessions.find(x => x.id === item.dep_area_session_id)
    if (!s) return null
    const base = item.dep_anchor === 'end' ? areaEnd(s, onTrack) : areaStart(s, onTrack)
    return base + (item.dep_offset_mins || 0)
  }
  return null
}

function getScheduledDueMins(item, onTrack, areaSessions) {
  if (!item.dep_type || item.dep_type === 'fixed') return item.due_mins ?? null
  const frozenOT = onTrack.map(s => ({ ...s, slip_mins: 0, cascade_slip_mins: 0, duration_override: null }))
  if (item.dep_type === 'on_track' && item.dep_on_track_id) {
    const s = frozenOT.find(x => x.id === item.dep_on_track_id)
    if (!s) return null
    const base = item.dep_anchor === 'end' ? otEnd(s) : otStart(s)
    return base + (item.dep_offset_mins || 0)
  }
  if (item.dep_type === 'area_session' && item.dep_area_session_id) {
    const s = areaSessions.find(x => x.id === item.dep_area_session_id)
    if (!s) return null
    const base = item.dep_anchor === 'end' ? areaEnd(s, frozenOT) : areaStart(s, frozenOT)
    return base + (item.dep_offset_mins || 0)
  }
  return null
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function MyScheduleView() {
  const { eventId, days, onTrack, areas, areaSessions, people } = useEvent()
  const { profile, user } = useAuth()
  const { toast } = useToast()

  const [checklistItems,  setChecklistItems]  = useState([])
  const [savingChecklist, setSavingChecklist] = useState(null)

  const sortedDays = [...days].sort((a, b) => a.sort_order - b.sort_order)

  const me = useMemo(
    () => people.find(p => p.linked_user_id === profile?.id),
    [people, profile]
  )

  // Load checklist items assigned to this person
  async function loadChecklist() {
    if (!me) return
    const { data } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('event_id', eventId)
      .eq('person_id', me.id)
    setChecklistItems(data || [])
  }

  useEffect(() => { loadChecklist() }, [eventId, me?.id])

  useEffect(() => {
    if (!me) return
    const channel = supabase
      .channel(`my-checklist-${eventId}-${me.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'checklist_items',
        filter: `event_id=eq.${eventId}`,
      }, loadChecklist)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [eventId, me?.id])

  async function toggleChecklist(item) {
    setSavingChecklist(item.id)
    const nowComplete = !item.completed
    const { error } = await supabase
      .from('checklist_items')
      .update({
        completed:    nowComplete,
        completed_by: nowComplete ? (user?.id || null) : null,
        completed_at: nowComplete ? new Date().toISOString() : null,
      })
      .eq('id', item.id)
    if (error) toast('Error', error.message, 'danger')
    else loadChecklist()
    setSavingChecklist(null)
  }

  // Build on-track + area session assignments
  const myAssignments = useMemo(() => {
    if (!me) return []
    const result = []

    const otIds = (me.people_on_track || []).map(r => r.session_id)
    otIds.forEach(id => {
      const s = onTrack.find(x => x.id === id)
      if (!s) return
      const slipMins    = (s.slip_mins || 0) + (s.cascade_slip_mins || 0)
      const slipped     = slipMins !== 0 || s.duration_override != null
      result.push({
        id:             s.id,
        dayId:          s.day_id,
        type:           'ontrack',
        label:          s.category ? `${s.category} — ${s.name}` : s.name,
        start:          otStart(s),
        end:            otEnd(s),
        scheduledStart: s.start_mins,
        scheduledEnd:   s.start_mins + s.duration_mins,
        slipped,
        slipMins,
        notes:          s.notes || null,
        radio:          me.radio_channel || null,
        color:          null,
      })
    })

    const asIds = (me.people_area_sessions || []).map(r => r.area_session_id)
    asIds.forEach(id => {
      const s = areaSessions.find(x => x.id === id)
      if (!s) return
      const area      = areas.find(a => a.id === s.area_id)
      const slipped   = isAreaSlipped(s, onTrack)
      const frozenOT  = onTrack.map(ot => ({ ...ot, slip_mins: 0, cascade_slip_mins: 0, duration_override: null }))
      const actualStart  = areaStart(s, onTrack)
      const actualEnd    = areaEnd(s, onTrack)
      const schedStart   = areaStart(s, frozenOT)
      const schedEnd     = areaEnd(s, frozenOT)
      result.push({
        id:             s.id,
        dayId:          s.day_id,
        type:           'area',
        label:          area ? `${area.name} — ${s.name}` : s.name,
        start:          actualStart,
        end:            actualEnd,
        scheduledStart: schedStart,
        scheduledEnd:   schedEnd,
        slipped,
        slipMins:       slipped ? (actualStart - schedStart) : 0,
        notes:          null,
        radio:          me.radio_channel || null,
        color:          area?.color || null,
      })
    })

    return result
  }, [me, onTrack, areaSessions, areas])

  // Build checklist tasks with due times for the schedule timeline
  const myChecklist = useMemo(() => {
    if (!me) return []
    return checklistItems
      .map(c => {
        const dueMins       = getDueMins(c, onTrack, areaSessions)
        const scheduledMins = getScheduledDueMins(c, onTrack, areaSessions)
        if (dueMins == null) return null   // no due time = won't appear in timeline
        const isLinked  = c.dep_type === 'on_track' || c.dep_type === 'area_session'
        const isSlipped = isLinked && scheduledMins != null && dueMins !== scheduledMins
        return {
          id:             c.id,
          dayId:          c.day_id,
          type:           'checklist',
          label:          c.title,
          start:          dueMins,
          scheduledStart: scheduledMins,
          slipped:        isSlipped,
          completed:      c.completed,
          completed_at:   c.completed_at,
        }
      })
      .filter(Boolean)
  }, [checklistItems, onTrack, areaSessions, me])

  // ── Empty / unlinked states ──

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

  const totalItems     = myAssignments.length + myChecklist.length
  const slippedCount   = [...myAssignments, ...myChecklist].filter(s => s.slipped).length
  const tasksDone      = myChecklist.filter(c => c.completed).length
  const tasksTotal     = myChecklist.length

  if (totalItems === 0) {
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📱</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>Nothing assigned yet</div>
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          Your schedule will appear here once sessions and tasks have been assigned to you.
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
            {me.phone_whatsapp && <span style={metaItem}>📱 {me.phone_whatsapp}</span>}
            {me.radio_channel  && <span style={metaItem}>📻 {me.radio_channel}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            {myAssignments.length} session{myAssignments.length !== 1 ? 's' : ''}
            {tasksTotal > 0 && ` · ${tasksDone}/${tasksTotal} tasks done`}
          </div>
          {slippedCount > 0 && (
            <div style={slipAlertBanner}>
              ⚠ {slippedCount} item{slippedCount > 1 ? 's' : ''} updated
            </div>
          )}
        </div>
      </div>

      {/* Combined timeline by day */}
      {sortedDays.map(day => {
        const daySessions  = myAssignments.filter(s => s.dayId === day.id)
        const dayTasks     = myChecklist.filter(c => c.dayId === day.id)
        const allItems     = [...daySessions, ...dayTasks].sort((a, b) => a.start - b.start)

        if (allItems.length === 0) return null

        return (
          <div key={day.id} style={{ marginBottom: 28 }}>
            <div style={dayHeader}>{day.name}</div>

            {allItems.map(item =>
              item.type === 'checklist' ? (
                <ChecklistTaskCard
                  key={`cl-${item.id}`}
                  item={item}
                  day={day}
                  onToggle={toggleChecklist}
                  saving={savingChecklist === item.id}
                />
              ) : (
                <div key={item.id} style={sessionCard(item.slipped, item.color)}>
                  {/* Time block */}
                  <div style={timeBlock(item.slipped)}>
                    <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                      {fromMins(item.start)}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 1 }}>
                      → {fromMins(item.end)}
                    </div>
                    <div style={{ fontSize: 10, color: item.slipped ? 'rgba(249,115,22,0.7)' : 'var(--text-dim)', marginTop: 1 }}>
                      {durStr(item.end - item.start)}
                    </div>
                    {item.slipped && item.scheduledStart !== item.start && (
                      <div style={wasTime}>was {fromMins(item.scheduledStart)}</div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="s-name" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{item.label}</div>
                    {item.slipped && item.slipMins !== 0 && (
                      <div style={slipBadge}>
                        ⚠ Running {item.slipMins > 0 ? `+${item.slipMins}m late` : `${Math.abs(item.slipMins)}m early`}
                      </div>
                    )}
                    {item.notes && <div style={notesStyle}>{item.notes}</div>}
                    {item.radio  && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>📻 {item.radio}</div>}
                  </div>

                  {/* Type badge */}
                  <div style={typeBadge(item.type, item.slipped)}>
                    {item.type === 'ontrack' ? 'On-Track' : 'Activation'}
                  </div>
                </div>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Checklist task card ───────────────────────────────────────────────────────

function ChecklistTaskCard({ item, day, onToggle, saving }) {
  const nowMins   = new Date().getHours() * 60 + new Date().getMinutes()
  const isOverdue = !item.completed && item.start < nowMins && isDayOverduable(day)

  return (
    <div style={taskCard(item.completed, item.slipped, isOverdue)}>
      {/* Time block */}
      <div style={taskTimeBlock(item.completed, item.slipped, isOverdue)}>
        <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {fromMins(item.start)}
        </div>
        {item.slipped && item.scheduledStart != null && item.scheduledStart !== item.start && (
          <div style={{ fontSize: 10, textDecoration: 'line-through', color: 'var(--text-dim)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
            {fromMins(item.scheduledStart)}
          </div>
        )}
        {isOverdue && (
          <div style={{ fontSize: 9, fontWeight: 800, color: '#ef4444', marginTop: 2, letterSpacing: '0.3px' }}>
            OVERDUE
          </div>
        )}
      </div>

      {/* Label + badges */}
      <div className="s-name" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          fontSize: 13, fontWeight: 700,
          color: item.completed ? 'var(--text-dim)' : 'var(--text)',
          textDecoration: item.completed ? 'line-through' : 'none',
        }}>
          {item.label}
        </div>
        {item.slipped && (
          <div style={slipBadge}>⚠ Due time updated</div>
        )}
      </div>

      {/* Checkbox */}
      <button
        onClick={() => onToggle(item)}
        disabled={saving}
        style={taskCheckbox(item.completed)}
        title={item.completed ? 'Mark incomplete' : 'Mark done'}
      >
        {item.completed ? '✓' : ''}
      </button>
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

function taskCard(completed, slipped, isOverdue) {
  const borderColor = completed ? 'var(--success)'
    : isOverdue ? '#ef4444'
    : slipped   ? 'var(--warning)'
    : 'var(--text-dim)'
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: isOverdue && !completed ? 'rgba(239,68,68,0.05)'
      : slipped && !completed ? 'rgba(249,115,22,0.05)'
      : completed ? 'transparent'
      : 'var(--surface)',
    border: `1px solid ${completed ? 'var(--border)' : isOverdue ? 'rgba(239,68,68,0.3)' : slipped ? 'rgba(249,115,22,0.3)' : 'var(--border)'}`,
    borderLeft: `4px solid ${borderColor}`,
    borderRadius: 10,
    padding: '10px 14px',
    marginBottom: 8,
    opacity: completed ? 0.55 : 1,
    transition: 'opacity 0.2s',
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

function taskTimeBlock(completed, slipped, isOverdue) {
  return {
    minWidth: 64,
    flexShrink: 0,
    textAlign: 'right',
    color: completed ? 'var(--text-dim)'
      : isOverdue ? '#ef4444'
      : slipped   ? 'var(--warning)'
      : 'var(--text-dim)',
  }
}

function taskCheckbox(completed) {
  return {
    width: 26, height: 26,
    flexShrink: 0,
    borderRadius: 6,
    border: `2px solid ${completed ? 'var(--success)' : 'var(--border)'}`,
    background: completed ? 'var(--success)' : 'transparent',
    color: '#fff', fontSize: 14, fontWeight: 700,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
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
