import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import { toMins, fromMins } from '../../lib/time'

export default function AddEditAreaSessionModal({
  session,        // null = adding, object = editing
  areaId,
  eventId,
  dayId,          // current day context
  days,
  onTrack,        // for dependency dropdowns
  onClose,
  onSaved,
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  // ── Start dependency ─────────────────────────────────────────────────────
  // dep_type: 'fixed' | 'after'
  // dep_session_id: OT session id (only when dep_type === 'after')
  // dep_offset_mins: signed offset after the OT session ends
  // start_mins: used when dep_type === 'fixed'

  // ── Finish dependency ────────────────────────────────────────────────────
  // fin_dep_type: 'duration' | 'otStart' | 'otEnd'
  // fin_dep_session_id: OT session id (only when fin_dep_type !== 'duration')
  // fin_dep_offset_mins: signed offset
  // duration_mins: used when fin_dep_type === 'duration'

  const [form, setForm] = useState({
    day_id:             session?.day_id           || dayId || (days[0]?.id ?? ''),
    name:               session?.name             || '',
    dep_type:           session?.dep_type         || 'fixed',
    dep_session_id:     session?.dep_session_id   || '',
    dep_offset_mins:    session?.dep_offset_mins  ?? 0,
    start_time:         session?.start_mins != null ? fromMins(session.start_mins) : '09:00',
    fin_dep_type:       session?.fin_dep_type     || 'duration',
    fin_dep_session_id: session?.fin_dep_session_id || '',
    fin_dep_offset_mins: session?.fin_dep_offset_mins ?? 0,
    duration_mins:      session?.duration_mins    ?? 60,
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  // OT sessions on the selected day, sorted by start
  const dayOTSessions = onTrack
    .filter(s => s.day_id === form.day_id)
    .sort((a, b) => a.start_mins - b.start_mins)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)

    const data = {
      event_id:   eventId,
      area_id:    areaId,
      day_id:     form.day_id,
      name:       form.name.trim(),

      // Start — start_mins must never be null (DB constraint); use 0 as sentinel when dep drives timing
      dep_type:        form.dep_type,
      dep_session_id:  form.dep_type === 'after' ? (form.dep_session_id || null) : null,
      dep_offset_mins: form.dep_type === 'after' ? parseInt(form.dep_offset_mins, 10) : 0,
      start_mins:      form.dep_type === 'fixed'  ? toMins(form.start_time) : 0,

      // Finish — duration_mins must never be null (DB constraint); use 0 as sentinel when dep drives finish
      fin_dep_type:        form.fin_dep_type,
      fin_dep_session_id:  form.fin_dep_type !== 'duration' ? (form.fin_dep_session_id || null) : null,
      fin_dep_offset_mins: form.fin_dep_type !== 'duration' ? parseInt(form.fin_dep_offset_mins, 10) : 0,
      duration_mins:       form.fin_dep_type === 'duration' ? parseInt(form.duration_mins, 10) : 0,
    }

    const { error } = session
      ? await supabase.from('area_sessions').update(data).eq('id', session.id)
      : await supabase.from('area_sessions').insert([data])

    if (error) {
      toast('Error', error.message, 'danger')
      setSaving(false)
    } else {
      toast(session ? 'Session updated' : 'Session added', data.name, 'success')
      onSaved()
    }
  }

  const otLabel = s => {
    const cat = s.category ? `${s.category} — ` : ''
    return `${cat}${s.name} (${fromMins(s.start_mins)})`
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{session ? 'Edit Area Session' : 'Add Area Session'}</div>
        <form onSubmit={handleSave}>

          {/* Name + Day */}
          <div className="form-row">
            <div className="form-group">
              <label>Session Name *</label>
              <input
                required autoFocus
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Grid Walk, Media Pen"
              />
            </div>
            <div className="form-group" style={{ maxWidth: 160 }}>
              <label>Day *</label>
              <select required value={form.day_id} onChange={e => set('day_id', e.target.value)}>
                {days.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          {/* ── Start dependency ── */}
          <div style={sectionStyle}>
            <div style={sectionLabel}>⏱ Start</div>

            <div className="form-group">
              <label>Starts…</label>
              <select value={form.dep_type} onChange={e => set('dep_type', e.target.value)}>
                <option value="fixed">At a fixed time</option>
                <option value="after">After an on-track session ends</option>
              </select>
            </div>

            {form.dep_type === 'fixed' && (
              <div className="form-group" style={{ maxWidth: 160 }}>
                <label>Start Time *</label>
                <input
                  type="time" required
                  value={form.start_time}
                  onChange={e => set('start_time', e.target.value)}
                />
              </div>
            )}

            {form.dep_type === 'after' && (
              <div className="form-row">
                <div className="form-group">
                  <label>After session *</label>
                  <select
                    required
                    value={form.dep_session_id}
                    onChange={e => set('dep_session_id', e.target.value)}
                  >
                    <option value="">— select on-track session —</option>
                    {dayOTSessions.map(s => (
                      <option key={s.id} value={s.id}>{otLabel(s)}</option>
                    ))}
                  </select>
                  {dayOTSessions.length === 0 && (
                    <span className="form-hint" style={{ color: 'var(--danger)' }}>
                      No on-track sessions on this day yet
                    </span>
                  )}
                </div>
                <div className="form-group" style={{ maxWidth: 140 }}>
                  <label>Offset (mins)</label>
                  <input
                    type="number" min="-120" max="120"
                    value={form.dep_offset_mins}
                    onChange={e => set('dep_offset_mins', e.target.value)}
                  />
                  <span className="form-hint">Negative = before session ends</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Finish dependency ── */}
          <div style={sectionStyle}>
            <div style={sectionLabel}>🏁 Finish</div>

            <div className="form-group">
              <label>Finishes…</label>
              <select value={form.fin_dep_type} onChange={e => set('fin_dep_type', e.target.value)}>
                <option value="duration">After a fixed duration</option>
                <option value="otStart">When an on-track session starts</option>
                <option value="otEnd">When an on-track session ends</option>
              </select>
            </div>

            {form.fin_dep_type === 'duration' && (
              <div className="form-group" style={{ maxWidth: 160 }}>
                <label>Duration (mins) *</label>
                <input
                  type="number" min="1" max="600" required
                  value={form.duration_mins}
                  onChange={e => set('duration_mins', e.target.value)}
                />
              </div>
            )}

            {form.fin_dep_type !== 'duration' && (
              <div className="form-row">
                <div className="form-group">
                  <label>
                    {form.fin_dep_type === 'otStart' ? 'When session starts' : 'When session ends'} *
                  </label>
                  <select
                    required
                    value={form.fin_dep_session_id}
                    onChange={e => set('fin_dep_session_id', e.target.value)}
                  >
                    <option value="">— select on-track session —</option>
                    {dayOTSessions.map(s => (
                      <option key={s.id} value={s.id}>{otLabel(s)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ maxWidth: 140 }}>
                  <label>Offset (mins)</label>
                  <input
                    type="number" min="-120" max="120"
                    value={form.fin_dep_offset_mins}
                    onChange={e => set('fin_dep_offset_mins', e.target.value)}
                  />
                  <span className="form-hint">Negative = before that moment</span>
                </div>
              </div>
            )}
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

const sectionStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '14px 16px',
  marginBottom: 16,
}

const sectionLabel = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.8px',
  textTransform: 'uppercase',
  color: 'var(--text-dim)',
  marginBottom: 12,
}
