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
    : offset > 0
      ? `${offset}m after`
      : 'at'

  if (item.dep_type === 'on_track' && item.dep_on_track_id) {
    const s = onTrack.find(x => x.id === item.dep_on_track_id)
    if (!s) return null
    const day = days.find(d => d.id === s.day_id)
    return `${dirLabel} ${s.category || s.name} ${anchorLabel}${day ? ` · ${day.name}` : ''}`
  }
  if (item.dep_type === 'area_session' && item.dep_area_session_id) {
    const s = areaSessions.find(x => x.id === item.dep_area_session_id)
    if (!s) return null
    const day = days.find(d => d.id === s.day_id)
    return `${dirLabel} ${s.name} ${anchorLabel}${day ? ` · ${day.name}` : ''}`
  }
  return null
}

function nowMins() {
  const n = new Date()
  return n.getHours() * 60 + n.getMinutes()
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function ChecklistView() {
  const { eventId, people, onTrack, areaSessions, days } = useEvent()
  const { isOpsOrAbove, user } = useAuth()
  const { toast } = useToast()

  const [items,       setItems]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showAdd,     setShowAdd]     = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [saving,      setSaving]      = useState(null)
  const [now,         setNow]         = useState(nowMins())

  // Refresh "now" every minute so overdue badges auto-update
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

  // Real-time subscription
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

  const done    = items.filter(i => i.completed)
  const pending = items.filter(i => !i.completed)

  const overdueCount = pending.filter(i => {
    const due = getDueMins(i, onTrack, areaSessions)
    return due != null && now > due
  }).length

  if (loading) return <div className="empty">Loading checklist…</div>

  const sharedRowProps = {
    people, isOpsOrAbove, saving, onTrack, areaSessions, days, now,
    onToggle: item => toggleComplete(item),
    onEdit:   item => setEditingItem(item),
    onDelete: item => deleteItem(item),
  }

  return (
    <div>
      {/* Header */}
      <div className="sec-header" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="sec-title">Event Checklist</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {done.length}/{items.length} done
          </span>
          {overdueCount > 0 && (
            <span style={overduePill}>⚠ {overdueCount} overdue</span>
          )}
          {items.length > 0 && (
            <div style={progressBar}>
              <div style={progressFill(done.length / items.length)} />
            </div>
          )}
        </div>
        {isOpsOrAbove && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            + Add Item
          </button>
        )}
      </div>

      {items.length === 0 && (
        <div className="empty">
          <div style={{ fontSize: 28, marginBottom: 10 }}>✅</div>
          No checklist items yet.
          {isOpsOrAbove && <><br />Click <strong>+ Add Item</strong> to build your pre-event checklist.</>}
        </div>
      )}

      {/* Pending items */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {pending.map(item => (
            <ChecklistRow key={item.id} item={item} saving={saving === item.id} {...sharedRowProps} />
          ))}
        </div>
      )}

      {/* Completed items */}
      {done.length > 0 && (
        <div>
          <div style={sectionDivider}>Completed ({done.length})</div>
          {done.map(item => (
            <ChecklistRow key={item.id} item={item} saving={saving === item.id} {...sharedRowProps} />
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {(showAdd || editingItem) && (
        <AddEditChecklistModal
          item={editingItem}
          eventId={eventId}
          people={people}
          onTrack={onTrack}
          areaSessions={areaSessions}
          days={days}
          onClose={() => { setShowAdd(false); setEditingItem(null) }}
          onSaved={() => { setShowAdd(false); setEditingItem(null); loadItems() }}
        />
      )}
    </div>
  )
}

// ── Checklist row ─────────────────────────────────────────────────────────────

function ChecklistRow({ item, people, isOpsOrAbove, saving, onToggle, onEdit, onDelete, onTrack, areaSessions, days, now }) {
  const assignee  = people.find(p => p.id === item.person_id)
  const dueMins   = getDueMins(item, onTrack, areaSessions)
  const dueLabel  = getDueLabel(item, onTrack, areaSessions, days)
  const isLinked  = item.dep_type === 'on_track' || item.dep_type === 'area_session'
  const isOverdue = dueMins != null && !item.completed && now > dueMins

  const doneAt = item.completed_at
    ? new Date(item.completed_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null

  return (
    <div style={rowStyle(item.completed, isOverdue)}>
      {/* Checkbox */}
      <button
        onClick={() => onToggle(item)}
        disabled={saving}
        style={checkBox(item.completed)}
        title={item.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {item.completed ? '✓' : ''}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600,
          color: item.completed ? 'var(--text-dim)' : 'var(--text)',
          textDecoration: item.completed ? 'line-through' : 'none',
        }}>
          {item.title}
        </div>
        {item.description && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            {item.description}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {assignee && (
            <span style={metaBadge()}>👤 {assignee.name}</span>
          )}
          {dueMins != null && (
            <span style={metaBadge(isOverdue ? '#ef4444' : item.completed ? 'var(--success)' : null)}>
              🕐 {fromMins(dueMins)}
              {isLinked && dueLabel && (
                <span style={{ fontWeight: 400, marginLeft: 4, opacity: 0.8 }}>· {dueLabel}</span>
              )}
              {isOverdue && <span style={{ marginLeft: 5, fontWeight: 800, letterSpacing: '0.3px' }}>OVERDUE</span>}
            </span>
          )}
          {item.completed && doneAt && (
            <span style={metaBadge('var(--success)')}>✓ Done {doneAt}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      {isOpsOrAbove && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-xs" onClick={() => onEdit(item)}>Edit</button>
          <button className="btn btn-danger btn-xs" onClick={() => onDelete(item)}>✕</button>
        </div>
      )}
    </div>
  )
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────

function AddEditChecklistModal({ item, eventId, people, onTrack, areaSessions, days, onClose, onSaved }) {
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
    due_mode:             initDueMode(),
    due_time:             item?.due_mins != null ? fromMins(item.due_mins) : '',
    dep_on_track_id:      item?.dep_on_track_id     || '',
    dep_area_session_id:  item?.dep_area_session_id || '',
    dep_offset_magnitude: Math.abs(item?.dep_offset_mins || 0),
    dep_offset_direction: (item?.dep_offset_mins || 0) < 0 ? 'before' : 'after',
    dep_anchor:           item?.dep_anchor || 'start',
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  // Sessions grouped by day for dropdowns
  const sortedDays = [...days].sort((a, b) => a.sort_order - b.sort_order)

  const otByDay = sortedDays.map(d => ({
    day: d,
    sessions: [...onTrack]
      .filter(s => s.day_id === d.id)
      .sort((a, b) => a.start_mins - b.start_mins),
  })).filter(g => g.sessions.length > 0)

  const asByDay = sortedDays.map(d => ({
    day: d,
    sessions: [...areaSessions]
      .filter(s => s.day_id === d.id)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter(g => g.sessions.length > 0)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)

    const offsetMins = (form.due_mode === 'on_track' || form.due_mode === 'area_session')
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

          {/* Due time mode */}
          <div className="form-group">
            <label>Due Time</label>
            <select value={form.due_mode} onChange={e => set('due_mode', e.target.value)}>
              <option value="none">No due time</option>
              <option value="fixed">Fixed time</option>
              <option value="on_track">Linked to on-track session</option>
              <option value="area_session">Linked to activation</option>
            </select>
          </div>

          {/* Fixed time */}
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

          {/* On-track session picker */}
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

          {/* Activation session picker */}
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

          {/* Offset fields — shown for both linked modes */}
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

          {/* Assign + order */}
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

function rowStyle(completed, isOverdue) {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    background: isOverdue && !completed ? 'rgba(239,68,68,0.04)' : completed ? 'transparent' : 'var(--surface)',
    border: '1px solid var(--border)',
    borderLeft: `4px solid ${completed ? 'var(--success)' : isOverdue ? '#ef4444' : 'var(--accent)'}`,
    borderRadius: 9,
    padding: '11px 14px',
    marginBottom: 8,
    opacity: completed ? 0.6 : 1,
    transition: 'opacity 0.2s',
  }
}

function checkBox(completed) {
  return {
    width: 22, height: 22, flexShrink: 0,
    borderRadius: 6,
    border: `2px solid ${completed ? 'var(--success)' : 'var(--border)'}`,
    background: completed ? 'var(--success)' : 'transparent',
    color: '#fff', fontSize: 13, fontWeight: 700,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
    marginTop: 1,
  }
}

function metaBadge(color) {
  return {
    fontSize: 11,
    fontWeight: color ? 600 : 400,
    color: color || 'var(--text-dim)',
    background: 'var(--surface2)',
    border: `1px solid ${color ? 'currentColor' : 'var(--border)'}`,
    borderRadius: 4,
    padding: '2px 7px',
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

const sectionDivider = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.8px',
  textTransform: 'uppercase',
  color: 'var(--text-dim)',
  padding: '6px 0 10px',
  borderTop: '1px solid var(--border)',
  marginBottom: 6,
}

const progressBar = {
  width: 80, height: 5,
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
    transition: 'width 0.3s',
  }
}
