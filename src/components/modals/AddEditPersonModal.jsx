import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'

export default function AddEditPersonModal({ person, eventId, departments = [], onClose, onSaved }) {
  const { toast } = useToast()
  const [saving,   setSaving]   = useState(false)
  const [profiles, setProfiles] = useState([])  // user_profiles for the link dropdown

  const [form, setForm] = useState({
    name:           person?.name           || '',
    phone_whatsapp: person?.phone_whatsapp || '',
    radio_channel:  person?.radio_channel  || '',
    department_id:  person?.department_id  || '',
    linked_user_id: person?.linked_user_id || '',
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  // Load all user profiles so ops can link a person to an account
  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('id, name, role')
      .order('name')
      .then(({ data }) => setProfiles(data || []))
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)

    const data = {
      event_id:       eventId,
      name:           form.name.trim(),
      phone_whatsapp: form.phone_whatsapp.trim() || null,
      radio_channel:  form.radio_channel.trim()  || null,
      department_id:  form.department_id || null,
      linked_user_id: form.linked_user_id || null,
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

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Radio Channel <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <input
              value={form.radio_channel}
              onChange={e => set('radio_channel', e.target.value)}
              placeholder="e.g. Ch 3"
            />
          </div>

          {departments.length > 0 && (
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Department <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
              <select
                value={form.department_id}
                onChange={e => set('department_id', e.target.value)}
              >
                <option value="">— no department —</option>
                {[...departments]
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Link to User Account <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <select
              value={form.linked_user_id}
              onChange={e => set('linked_user_id', e.target.value)}
            >
              <option value="">— not linked —</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role?.replace('_', ' ')})
                </option>
              ))}
            </select>
            <span className="form-hint">Links this person to their login so they can see My Schedule.</span>
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
