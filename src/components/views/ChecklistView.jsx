import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useEvent } from '../../context/EventContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { fromMins, toMins, otStart, otEnd } from '../../lib/time'
import { areaStart, areaEnd } from '../../lib/conflicts'

// ── Due time helpers ──────────────────────────────────────────────────────────

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

function getDueLabel(item, onTrack, areaSessions, days) {
  const offset = item.dep_offset_mins || 0
  const anchorLabel = item.dep_anchor === 'end' ? 'end' : 'start'
  const dirLabel = offset < 0
    ? `${Math.abs(offset)}m before`
    : offset > 0 ? `${offset}m after` : 'at'

  if (item.dep_type === 'on_track' && item.dep_on_track_id) {
    const s = onTrack.find(x => x.id === item.dep_on_track_id)
    if (!s) return null
    return `${dirLabel} ${s.category || s.name} ${anchorLabel}`
  }
  if (item.dep_type === 'area_session' && item.dep_area_session_id) {
    const s = areaSessions.find(x => x.id === item.dep_area_session_id)
    if (!s) return null
    return `${dirLabel} ${s.name} ${anchorLabel}`
  }
  return null
}

// Due time with all slips zeroed — used to detect if a linked due time has moved
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

function sortByDueTime(items, onTrack, areaSessions) {
  return [...items].sort((a, b) => {
    const dA = getDueMins(a, onTrack, areaSessions)
    const dB = getDueMins(b, onTrack, areaSessions)
    if (dA == null && dB == null) return a.sort_order - b.sort_order
    if (dA == null) return 1
    if (dB == null) return -1
    return dA - dB
  })
}

function nowMins() {
  const n = new Date()
  return n.getHours() * 60 + n.getMinutes()
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function ChecklistView() {
  const { eventId, people, onTrack, areaSessions, days } = useEvent()
  const { isOpsOrAbove, user, profile } = useAuth()
  const { toast } = useToast()

  const [items,       setItems]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [editingItem, setEditingItem] = useState(null)
  const [addDayId,    setAddDayId]    = useState(null) // null = modal closed
  const [saving,      setSaving]      = useState(null)
  const [now,         setNow]         = useState(nowMins())

  useEffect(() => {
    const t = setInterval(() => setNow(nowMins()), 60_000)
    return () => clearInterval(t)
  }, [])

  async function loadItems() {
    const { data, error } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('event_id', eventId)
      .order('sort_order')
      .order('created_at')
    if (!error) setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { loadItems() }, [eventId])

  useEffect(() => {
    const channel = supabase
      .channel(`checklist-${eventId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'checklist_items',
        filter: `event_id=eq.${eventId}`,
      }, loadItems)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [eventId])

  async function toggleComplete(item) {
    setSaving(item.id)
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
    else loadItems()
    setSaving(null)
  }

  async function deleteItem(item) {
    if (!confirm(`Delete "${item.title}"?`)) return
    const { error } = await supabase.from('checklist_items').delete().eq('id', item.id)
    if (error) toast('Error', error.message, 'danger')
    else { toast('Deleted', item.title, 'success'); loadItems() }
  }

  // Filter by user (ops see all, others see only their assigned items)
  const me = people.find(p => p.linked_user_id === profile?.id)
  const visibleItems = isOpsOrAbove ? items : items.filter(i => i.person_id === me?.id)

  const totalDone    = visibleItems.filter(i => i.completed).length
  const overdueCount = visibleItems.filter(i => {
    const due = getDueMins(i, onTrack, areaSessions)
    return due != null && !i.completed && now > due
  }).length

  const sortedDays = [...days].sort((a, b) => a.sort_order - b.sort_order)

  // Items grouped per day
  const itemsForDay = dayId => visibleItems.filter(i => i.day_id === dayId)

  if (loading) return <div className="empty">Loading checklist…</div>

  if (visibleItems.length === 0 && !isOpsOrAbove) {
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>✅</div>
        No checklist items assigned to you yet.
        <br />Your ops lead will assign items as the event approaches.
      </div>
    )
  }

  const sharedRowProps = {
    people, isOpsOrAbove, saving, onTrack, areaSessions, days, now,
    onToggle: item => toggleComplete(item),
    onEdit:   item => setEditingItem(item),
    onDelete: item => deleteItem(item),
  }

  return (
    <div>
      {/* Header */}
      <div className="sec-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="sec-title">Event Checklist</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {totalDone}/{visibleItems.length} done
          </span>
          {overdueCount > 0 && (
            <span style={overduePill}>⚠ {overdueCount} overdue</span>
          )}
          {visibleItems.length > 0 && (
            <div style={progressBarStyle}>
              <div style={progressFill(totalDone / visibleItems.length)} />
            </div>
          )}
        </div>
      </div>

      {/* Day columns grid — fills full width, up to 4 columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(Math.max(sortedDays.length, 1), 4)}, 1fr)`,
        gap: 14,
        alignItems: 'start',
      }}>
        {sortedDays.map(day => (
          <DayColumn
            key={day.id}
            label={day.name}
            dayId={day.id}
            items={sortByDueTime(itemsForDay(day.id), onTrack, areaSessions)}
            isOpsOrAbove={isOpsOrAbove}
            onAdd={() => setAddDayId(day.id)}
            rowProps={sharedRowProps}
            onTrack={onTrack}
            areaSessions={areaSessions}
            now={now}
          />
        ))}
      </div>

      {/* Add / Edit modal */}
      {(addDayId !== null || editingItem) && (
        <AddEditChecklistModal
          item={editingItem}
          eventId={eventId}
          people={people}
          onTrack={onTrack}
          areaSessions={areaSessions}
          days={sortedDays}
          defaultDayId={editingItem ? undefined : addDayId}
          onClose={() => { setAddDayId(null); setEditingItem(null) }}
          onSaved={() => { setAddDayId(null); setEditingItem(null); loadItems() }}
        />
      )}
    </div>
  )
}

// ── Day column ────────────────────────────────────────────────────────────────

function DayColumn({ label, dayId, items, isOpsOrAbove, onAdd, rowProps, onTrack, areaSessions, now }) {
  const pending   = items.filter(i => !i.completed)
  const done      = items.filter(i => i.completed)
  const overdue   = pending.filter(i => {
    const due = getDueMins(i, onTrack, areaSessions)
    return due != null && now > due
  }).length

  return (
    <div style={columnStyle}>
      {/* Column header */}
      <div style={columnHeader}>
        <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: '1px', textTransform: 'uppercase' }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {overdue > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>⚠ {overdue}</span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {done.length}/{items.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      {items.length > 0 && (
        <div style={{ ...progressBarStyle, margin: '8px 0 10px', width: '100%' }}>
          <div style={progressFill(items.length ? done.length / items.length : 0)} />
        </div>
      )}

      {/* Pending items */}
      {pending.map(item => (
        <ChecklistRow key={item.id} item={item} saving={rowProps.saving === item.id} {...rowProps} compact />
      ))}

      {/* Completed items */}
      {done.length > 0 && (
        <>
          <div style={doneDivider}>Done ({done.length})</div>
          {done.map(item => (
            <ChecklistRow key={item.id} item={item} saving={rowProps.saving === item.id} {...rowProps} compact />
          ))}
        </>
      )}

      {/* Empty state */}
      {items.length === 0 && !isOpsOrAbove && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0', textAlign: 'center' }}>
          Nothing assigned
        </div>
      )}

      {/* Add button */}
      {isOpsOrAbove && (
        <button
          className="btn btn-ghost btn-xs"
          onClick={onAdd}
          style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
        >
          + Add Item
        </button>
      )}
    </div>
  )
}

// ── Checklist row ─────────────────────────────────────────────────────────────

function ChecklistRow({ item, people, isOpsOrAbove, saving, onToggle, onEdit, onDelete, onTrack, areaSessions, days, now, compact }) {
  const dueMins          = getDueMins(item, onTrack, areaSessions)
  const scheduledDueMins = getScheduledDueMins(item, onTrack, areaSessions)
  const isLinked         = item.dep_type === 'on_track' || item.dep_type === 'area_session'
  const isSlipped        = isLinked && scheduledDueMins != null && dueMins !== scheduledDueMins
  const isOverdue        = dueMins != null && !item.completed && now > dueMins

  return (
    <div style={rowStyle(item.completed, isOverdue, isSlipped)}>
      {/* Checkbox */}
      <button
        onClick={() => onToggle(item)}
        disabled={saving}
        style={checkBox(item.completed)}
        title={item.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {item.completed ? '✓' : ''}
      </button>

      {/* Title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: item.completed ? 'var(--text-dim)' : 'var(--text)',
          textDecoration: item.completed ? 'line-through' : 'none',
          lineHeight: 1.3,
        }}>
          {item.title}
        </div>
      </div>

      {/* Due time */}
      {dueMins != null && (
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: isOverdue ? '#ef4444' : isSlipped ? 'var(--warning)' : item.completed ? 'var(--success)' : 'var(--text)',
          }}>
            🕐 {fromMins(dueMins)}
            {isOverdue && <span style={{ fontSize: 10, marginLeft: 4, fontWeight: 800, letterSpacing: '0.3px' }}>OVERDUE</span>}
          </div>
          {isSlipped && (
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textDecoration: 'line-through', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {fromMins(scheduledDueMins)}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {isOpsOrAbove && (
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-xs" onClick={() => onEdit(item)}>Edit</button>
          <button className="btn btn-danger btn-xs" onClick={() => onDelete(item)}>✕</button>
        </div>
      )}
    </div>
  )
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────

function AddEditChecklistModal({ item, eventId, people, onTrack, areaSessions, days, defaultDayId, onClose, onSaved }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const initDueMode = () => {
    if (!item) return 'none'
    if (item.dep_type === 'on_track')     return 'on_track'
    if (item.dep_type === 'area_session') return 'area_session'
    if (item.due_mins != null)            return 'fixed'
    return 'none'
  }

  const [form, setForm] = useState({
    title:                item?.title       || '',
    description:          item?.description || '',
    person_id:            item?.person_id   || '',
    sort_order:           item?.sort_order  ?? 0,
    day_id:               item?.day_id      ?? defaultDayId ?? '',
    due_mode:             initDueMode(),
    due_time:             item?.due_mins != null ? fromMins(item.due_mins) : '',
    dep_on_track_id:      item?.dep_on_track_id     || '',
    dep_area_session_id:  item?.dep_area_session_id || '',
    dep_offset_magnitude: Math.abs(item?.dep_offset_mins || 0),
    dep_offset_direction: (item?.dep_offset_mins || 0) < 0 ? 'before' : 'after',
    dep_anchor:           item?.dep_anchor || 'start',
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  const otByDay = days.map(d => ({
    day: d,
    sessions: [...onTrack]
      .filter(s => s.day_id === d.id)
      .sort((a, b) => a.start_mins - b.start_mins),
  })).filter(g => g.sessions.length > 0)

  const asByDay = days.map(d => ({
    day: d,
    sessions: [...areaSessions]
      .filter(s => s.day_id === d.id)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter(g => g.sessions.length > 0)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)

    const isLinked = form.due_mode === 'on_track' || form.due_mode === 'area_session'
    const offsetMins = isLinked
      ? (form.dep_offset_direction === 'before'
          ? -Math.abs(parseInt(form.dep_offset_magnitude, 10) || 0)
          :  Math.abs(parseInt(form.dep_offset_magnitude, 10) || 0))
      : 0

    const data = {
      event_id:            eventId,
      title:               form.title.trim(),
      description:         form.description.trim() || null,
      person_id:           form.person_id || null,
      sort_order:          parseInt(form.sort_order, 10) || 0,
      day_id:              form.day_id || null,
      dep_type:            form.due_mode === 'none' ? 'fixed' : form.due_mode,
      due_mins:            form.due_mode === 'fixed' && form.due_time ? toMins(form.due_time) : null,
      dep_on_track_id:     form.due_mode === 'on_track'     ? (form.dep_on_track_id     || null) : null,
      dep_area_session_id: form.due_mode === 'area_session' ? (form.dep_area_session_id || null) : null,
      dep_offset_mins:     offsetMins,
      dep_anchor:          form.dep_anchor,
    }

    const { error } = item
      ? await supabase.from('checklist_items').update(data).eq('id', item.id)
      : await supabase.from('checklist_items').insert([data])

    if (error) { toast('Error', error.message, 'danger'); setSaving(false) }
    else { toast(item ? 'Updated' : 'Added', data.title, 'success'); onSaved() }
  }

  const isLinkedMode = form.due_mode === 'on_track' || form.due_mode === 'area_session'

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-title">{item ? 'Edit Checklist Item' : 'Add Checklist Item'}</div>
        <form onSubmit={handleSave}>

          <div className="form-group">
            <label>Title *</label>
            <input
              required autoFocus
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Brief pit lane marshals"
            />
          </div>

          <div className="form-group">
            <label>Description <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Any extra detail…"
            />
          </div>

          {/* Day */}
          <div className="form-group">
            <label>Event Day *</label>
            <select value={form.day_id} onChange={e => set('day_id', e.target.value)} required>
              <option value="">— select a day —</option>
              {days.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Due time */}
          <div className="form-group">
            <label>Due Time</label>
            <select value={form.due_mode} onChange={e => set('due_mode', e.target.value)}>
              <option value="none">No due time</option>
              <option value="fixed">Fixed time</option>
              <option value="on_track">Linked to on-track session</option>
              <option value="area_session">Linked to activation</option>
            </select>
          </div>

          {form.due_mode === 'fixed' && (
            <div className="form-group">
              <label>Due at</label>
              <input
                type="time"
                value={form.due_time}
                onChange={e => set('due_time', e.target.value)}
                required
              />
            </div>
          )}

          {form.due_mode === 'on_track' && (
            <div className="form-group">
              <label>On-Track Session</label>
              <select
                value={form.dep_on_track_id}
                onChange={e => set('dep_on_track_id', e.target.value)}
                required
              >
                <option value="">— select session —</option>
                {otByDay.map(({ day, sessions }) => (
                  <optgroup key={day.id} label={day.name}>
                    {sessions.map(s => (
                      <option key={s.id} value={s.id}>
                        {fromMins(s.start_mins)} · {s.category ? `${s.category} — ${s.name}` : s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          {form.due_mode === 'area_session' && (
            <div className="form-group">
              <label>Activation Session</label>
              <select
                value={form.dep_area_session_id}
                onChange={e => set('dep_area_session_id', e.target.value)}
                required
              >
                <option value="">— select activation —</option>
                {asByDay.map(({ day, sessions }) => (
                  <optgroup key={day.id} label={day.name}>
                    {sessions.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          {isLinkedMode && (
            <div className="form-row" style={{ alignItems: 'flex-end' }}>
              <div className="form-group" style={{ maxWidth: 90 }}>
                <label>Minutes</label>
                <input
                  type="number" min="0" max="999"
                  value={form.dep_offset_magnitude}
                  onChange={e => set('dep_offset_magnitude', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Direction</label>
                <select value={form.dep_offset_direction} onChange={e => set('dep_offset_direction', e.target.value)}>
                  <option value="before">Before</option>
                  <option value="after">After</option>
                </select>
              </div>
              <div className="form-group">
                <label>Anchor</label>
                <select value={form.dep_anchor} onChange={e => set('dep_anchor', e.target.value)}>
                  <option value="start">Session start</option>
                  <option value="end">Session end</option>
                </select>
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Assign to <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
              <select value={form.person_id} onChange={e => set('person_id', e.target.value)}>
                <option value="">— unassigned —</option>
                {[...people].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ maxWidth: 100 }}>
              <label>Order</label>
              <input
                type="number" min="0"
                value={form.sort_order}
                onChange={e => set('sort_order', e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : item ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const columnStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '14px 12px',
}

const columnHeader = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  color: 'var(--accent)',
  borderBottom: '2px solid var(--accent)',
  paddingBottom: 8,
  marginBottom: 2,
}

const doneDivider = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.8px',
  textTransform: 'uppercase',
  color: 'var(--text-dim)',
  padding: '8px 0 6px',
  borderTop: '1px solid var(--border)',
  marginTop: 4,
}

function rowStyle(completed, isOverdue, isSlipped) {
  const borderColor = completed ? 'var(--success)'
    : isOverdue  ? '#ef4444'
    : isSlipped  ? 'var(--warning)'
    : 'var(--accent)'
  const bg = completed ? 'transparent'
    : isOverdue  ? 'rgba(239,68,68,0.04)'
    : isSlipped  ? 'rgba(249,115,22,0.04)'
    : 'var(--surface2)'
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: bg,
    border: '1px solid var(--border)',
    borderLeft: `3px solid ${borderColor}`,
    borderRadius: 7,
    padding: '8px 10px',
    marginBottom: 6,
    opacity: completed ? 0.55 : 1,
    transition: 'opacity 0.2s',
  }
}

function checkBox(completed) {
  return {
    width: 20, height: 20, flexShrink: 0,
    borderRadius: 5,
    border: `2px solid ${completed ? 'var(--success)' : 'var(--border)'}`,
    background: completed ? 'var(--success)' : 'transparent',
    color: '#fff', fontSize: 11, fontWeight: 700,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
    marginTop: 1,
  }
}

function metaBadge(color) {
  return {
    fontSize: 10,
    fontWeight: color ? 600 : 400,
    color: color || 'var(--text-dim)',
    background: 'var(--surface)',
    border: `1px solid ${color ? 'currentColor' : 'var(--border)'}`,
    borderRadius: 4,
    padding: '1px 6px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
  }
}

const overduePill = {
  fontSize: 11,
  fontWeight: 700,
  color: '#ef4444',
  background: 'rgba(239,68,68,0.1)',
  border: '1px solid rgba(239,68,68,0.35)',
  borderRadius: 10,
  padding: '2px 10px',
}

const progressBarStyle = {
  height: 4,
  background: 'var(--surface2)',
  borderRadius: 3,
  overflow: 'hidden',
}

function progressFill(ratio) {
  return {
    height: '100%',
    width: `${Math.round(ratio * 100)}%`,
    background: ratio === 1 ? 'var(--success)' : 'var(--accent)',
    borderRadius: 3,
    transition: 'width 0.4s',
  }
}
