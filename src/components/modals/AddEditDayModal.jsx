import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'

export default function AddEditDayModal({ day, eventId, existingCount, onClose, onSaved }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: day?.name || '',
    date: day?.date || '',
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)

    const data = {
      event_id: eventId,
      name:       form.name.trim(),
      date:       form.date || null,
      sort_order: day?.sort_order ?? existingCount,
    }

    if (day) {
      const { error } = await supabase.from('days').update(data).eq('id', day.id)
      if (error) { toast('Error', error.message, 'danger'); setSaving(false); return }
      toast('Day updated', form.name, 'success')
      onSaved(day.id)
    } else {
      const { data: result, error } = await supabase.from('days').insert([data]).select().single()
      if (error) { toast('Error', error.message, 'danger'); setSaving(false); return }
      toast('Day added', form.name, 'success')
      onSaved(result?.id)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-title">{day ? 'Edit Day' : 'Add Day'}</div>
        <form onSubmit={handleSave}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Day Name *</label>
            <input
              required autoFocus
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Saturday — Race Day 1"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Date <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : day ? 'Save Changes' : 'Add Day'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
