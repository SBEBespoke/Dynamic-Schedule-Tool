import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'

const AREA_COLORS = [
  { label: 'Blue',   value: '#3b82f6' },
  { label: 'Green',  value: '#22c55e' },
  { label: 'Amber',  value: '#f59e0b' },
  { label: 'Red',    value: '#ef4444' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Cyan',   value: '#06b6d4' },
  { label: 'Pink',   value: '#ec4899' },
  { label: 'Orange', value: '#f97316' },
]

export default function AddEditAreaModal({ area, eventId, onClose, onSaved }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name:  area?.name  || '',
    color: area?.color || AREA_COLORS[0].value,
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)

    const data = {
      event_id: eventId,
      name:     form.name.trim(),
      color:    form.color,
    }

    const { error } = area
      ? await supabase.from('areas').update(data).eq('id', area.id)
      : await supabase.from('areas').insert([data])

    if (error) {
      toast('Error', error.message, 'danger')
      setSaving(false)
    } else {
      toast(area ? 'Area updated' : 'Area added', data.name, 'success')
      onSaved()
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-title">{area ? 'Edit Area' : 'Add Area'}</div>
        <form onSubmit={handleSave}>

          <div className="form-group">
            <label>Area Name *</label>
            <input
              required autoFocus
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Pit Lane, Podium Stage, Fan Zone"
            />
          </div>

          <div className="form-group">
            <label>Colour</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
              {AREA_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => set('color', c.value)}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: c.value, border: 'none', cursor: 'pointer',
                    outline: form.color === c.value ? `3px solid white` : 'none',
                    boxShadow: form.color === c.value
                      ? `0 0 0 5px ${c.value}66`
                      : '0 1px 3px rgba(0,0,0,0.4)',
                    transition: 'box-shadow 0.15s',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : area ? 'Save Changes' : 'Add Area'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
