import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import { toMins, fromMins } from '../../lib/time'

const CATEGORIES = [
  'Race', 'Qualifying', 'Practice', 'Warm Up',
  'Support Race', 'Parade Lap', 'Safety Car', 'General',
]

export default function AddEditSessionModal({ session, days, defaultDayId, eventId, onClose, onSaved }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    day_id:        session?.day_id       || defaultDayId || (days[0]?.id ?? ''),
    name:          session?.name         || '',
    category:      session?.category     || 'General',
    start_time:    session              ? fromMins(session.start_mins) : '09:00',
    duration_mins: session?.duration_mins ?? 30,
    must_start_at: session?.must_start_at  != null ? fromMins(session.must_start_at)  : '',
    must_finish_by: session?.must_finish_by != null ? fromMins(session.must_finish_by) : '',
    notes:         session?.notes        || '',
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)

    const data = {
      event_id:      eventId,
      day_id:        form.day_id,
      name:          form.name.trim(),
      category:      form.category,
      start_mins:    toMins(form.start_time),
      duration_mins: parseInt(form.duration_mins, 10),
      must_start_at:  form.must_start_at  ? toMins(form.must_start_at)  : null,
      must_finish_by: form.must_finish_by ? toMins(form.must_finish_by) : null,
      notes:         form.notes.trim() || null,
      // preserve existing slip values when editing
      slip_mins:         session?.slip_mins         ?? 0,
      cascade_slip_mins: session?.cascade_slip_mins ?? 0,
    }

    const { error } = session
      ? await supabase.from('on_track_sessions').update(data).eq('id', session.id)
      : await supabase.from('on_track_sessions').insert([data])

    if (error) {
      toast('Error', error.message, 'danger')
      setSaving(false)
    } else {
      toast(session ? 'Session updated' : 'Session added', data.name, 'success')
      onSaved()
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{session ? 'Edit Session' : 'Add On-Track Session'}</div>
        <form onSubmit={handleSave}>

          {/* Name + Category */}
          <div className="form-row">
            <div className="form-group">
              <label>Session Name *</label>
              <input
                required autoFocus
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Race 1"
              />
            </div>
            <div className="form-group" style={{ maxWidth: 160 }}>
              <label>Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Day + Time + Duration */}
          <div className="form-row">
            <div className="form-group">
              <label>Day *</label>
              <select required value={form.day_id} onChange={e => set('day_id', e.target.value)}>
                {days.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ maxWidth: 130 }}>
              <label>Start Time *</label>
              <input
                type="time" required
                value={form.start_time}
                onChange={e => set('start_time', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ maxWidth: 130 }}>
              <label>Duration (mins) *</label>
              <input
                type="number" min="1" max="600" required
                value={form.duration_mins}
                onChange={e => set('duration_mins', e.target.value)}
              />
            </div>
          </div>

          {/* Hard constraints */}
          <div className="form-row">
            <div className="form-group">
              <label>🔒 Must Start At <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
              <input
                type="time"
                value={form.must_start_at}
                onChange={e => set('must_start_at', e.target.value)}
              />
              <span className="form-hint">Cascade cannot move this session</span>
            </div>
            <div className="form-group">
              <label>⏱ Must Finish By <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
              <input
                type="time"
                value={form.must_finish_by}
                onChange={e => set('must_finish_by', e.target.value)}
              />
              <span className="form-hint">Session will be shortened if needed</span>
            </div>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label>Briefing Notes <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Visible to assigned team members in My Schedule"
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : session ? 'Save Changes' : 'Add Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
