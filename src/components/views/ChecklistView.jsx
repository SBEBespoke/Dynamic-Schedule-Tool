import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useEvent } from '../../context/EventContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

export default function ChecklistView() {
  const { eventId, people } = useEvent()
  const { isOpsOrAbove, user } = useAuth()
  const { toast } = useToast()

  const [items,       setItems]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showAdd,     setShowAdd]     = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [saving,      setSaving]      = useState(null)

  // Load checklist items
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

  if (loading) return <div className="empty">Loading checklist…</div>

  return (
    <div>
      {/* Header */}
      <div className="sec-header" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="sec-title">Event Checklist</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {done.length}/{items.length} done
          </span>
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
            <ChecklistRow
              key={item.id}
              item={item}
              people={people}
              isOpsOrAbove={isOpsOrAbove}
              saving={saving === item.id}
              onToggle={() => toggleComplete(item)}
              onEdit={() => setEditingItem(item)}
              onDelete={() => deleteItem(item)}
            />
          ))}
        </div>
      )}

      {/* Completed items */}
      {done.length > 0 && (
        <div>
          <div style={sectionDivider}>Completed ({done.length})</div>
          {done.map(item => (
            <ChecklistRow
              key={item.id}
              item={item}
              people={people}
              isOpsOrAbove={isOpsOrAbove}
              saving={saving === item.id}
              onToggle={() => toggleComplete(item)}
              onEdit={() => setEditingItem(item)}
              onDelete={() => deleteItem(item)}
            />
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {(showAdd || editingItem) && (
        <AddEditChecklistModal
          item={editingItem}
          eventId={eventId}
          people={people}
          onClose={() => { setShowAdd(false); setEditingItem(null) }}
          onSaved={() => { setShowAdd(false); setEditingItem(null); loadItems() }}
        />
      )}
    </div>
  )
}

// ── Checklist row ─────────────────────────────────────────────────────────────

function ChecklistRow({ item, people, isOpsOrAbove, saving, onToggle, onEdit, onDelete }) {
  const assignee = people.find(p => p.id === item.person_id)
  const doneAt   = item.completed_at
    ? new Date(item.completed_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null

  return (
    <div style={rowStyle(item.completed)}>
      {/* Checkbox */}
      <button
        onClick={onToggle}
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
        <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {assignee && (
            <span style={metaBadge}>👤 {assignee.name}</span>
          )}
          {item.completed && doneAt && (
            <span style={{ ...metaBadge, color: 'var(--success)' }}>✓ {doneAt}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      {isOpsOrAbove && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-xs" onClick={onEdit}>Edit</button>
          <button className="btn btn-danger btn-xs" onClick={onDelete}>✕</button>
        </div>
      )}
    </div>
  )
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────

function AddEditChecklistModal({ item, eventId, people, onClose, onSaved }) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title:       item?.title       || '',
    description: item?.description || '',
    person_id:   item?.person_id   || '',
    sort_order:  item?.sort_order  ?? 0,
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const data = {
      event_id:    eventId,
      title:       form.title.trim(),
      description: form.description.trim() || null,
      person_id:   form.person_id || null,
      sort_order:  parseInt(form.sort_order, 10) || 0,
    }
    const { error } = item
      ? await supabase.from('checklist_items').update(data).eq('id', item.id)
      : await supabase.from('checklist_items').insert([data])
    if (error) { toast('Error', error.message, 'danger'); setSaving(false) }
    else { toast(item ? 'Updated' : 'Added', data.title, 'success'); onSaved() }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
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
          <div className="form-row">
            <div className="form-group">
              <label>Assign to <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
              <select value={form.person_id} onChange={e => set('person_id', e.target.value)}>
                <option value="">— unassigned —</option>
                {[...people].sort((a,b) => a.name.localeCompare(b.name)).map(p => (
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

function rowStyle(completed) {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    background: completed ? 'transparent' : 'var(--surface)',
    border: `1px solid ${completed ? 'var(--border)' : 'var(--border)'}`,
    borderLeft: `4px solid ${completed ? 'var(--success)' : 'var(--accent)'}`,
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

const metaBadge = {
  fontSize: 11,
  color: 'var(--text-dim)',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '1px 7px',
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
