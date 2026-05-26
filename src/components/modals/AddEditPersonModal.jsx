import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'

export default function AddEditPersonModal({ person, eventId, onClose, onSaved }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name:          person?.name          || '',
    phone_whatsapp: person?.phone_whatsapp || '',
    radio_channel: person?.radio_channel || '',
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)

    const data = {
      event_id:      eventId,
      name:          form.name.trim(),
      phone_whatsapp: form.phone_whatsapp.trim() || null,
      radio_channel: form.radio_channel.trim()  || null,
    }

    const { error } = person
      ? await supabase.from('people').update(data).eq('id', person.id)
      : await supabase.from('people').insert([data])

    if (error) {
      toast('Error', error.message, 'danger')
      setSaving(false)
    } else {
      toast(person ? 'Person updated' : 'Person added', data.name, 'success')
      onSaved()
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-title">{person ? 'Edit Team Member' : 'Add Team Member'}</div>
        <form onSubmit={handleSave}>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Full Name *</label>
            <input
              required autoFocus
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Alex Smith"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>WhatsApp Number <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <input
              type="tel"
              value={form.phone_whatsapp}
              onChange={e => set('phone_whatsapp', e.target.value)}
              placeholder="+61 400 000 000"
            />
            <span className="form-hint">Include country code. Used for slip notifications.</span>
          </div>

          <div className="form-group">
            <label>Radio Channel <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <input
              value={form.radio_channel}
              onChange={e => set('radio_channel', e.target.value)}
              placeholder="e.g. Ch 3"
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : person ? 'Save Changes' : 'Add Person'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
