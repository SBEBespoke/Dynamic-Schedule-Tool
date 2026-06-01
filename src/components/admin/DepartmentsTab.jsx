import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useEvent } from '../../context/EventContext'
import { useToast } from '../../context/ToastContext'

const PRESET_COLORS = [
  '#63b3ed', // blue (default)
  '#68d391', // green
  '#f6ad55', // orange
  '#fc8181', // red
  '#b794f4', // purple
  '#76e4f7', // cyan
  '#fbd38d', // yellow
  '#f687b3', // pink
]

export default function DepartmentsTab() {
  const { eventId, departments, people, reload } = useEvent()
  const { toast } = useToast()

  const [showForm,  setShowForm]  = useState(false)
  const [editing,   setEditing]   = useState(null)  // dept object or null
  const [deleting,  setDeleting]  = useState(null)

  const [form, setForm] = useState({ name: '', color: PRESET_COLORS[0] })
  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function openAdd() {
    setEditing(null)
    setForm({ name: '', color: PRESET_COLORS[0] })
    setShowForm(true)
  }

  function openEdit(dept) {
    setEditing(dept)
    setForm({ name: dept.name, color: dept.color })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditing(null)
    setForm({ name: '', color: PRESET_COLORS[0] })
  }

  async function handleSave(e) {
    e.preventDefault()
    const data = {
      event_id:   eventId,
      name:       form.name.trim(),
      color:      form.color,
      sort_order: editing ? editing.sort_order : departments.length,
    }
    const { error } = editing
      ? await supabase.from('departments').update(data).eq('id', editing.id)
      : await supabase.from('departments').insert([data])

    if (error) {
      toast('Error', error.message, 'danger')
    } else {
      toast(editing ? 'Department updated' : 'Department created', data.name, 'success')
      cancelForm()
      reload()
    }
  }

  async function handleDelete(dept) {
    const memberCount = people.filter(p => p.department_id === dept.id).length
    const warning = memberCount > 0
      ? `\n\nThis will remove ${memberCount} team member${memberCount > 1 ? 's' : ''} from the department (their records will be kept).`
      : ''
    if (!confirm(`Delete department "${dept.name}"?${warning}`)) return
    setDeleting(dept.id)
    const { error } = await supabase.from('departments').delete().eq('id', dept.id)
    if (error) toast('Error', error.message, 'danger')
    else { toast('Deleted', dept.name, 'success'); reload() }
    setDeleting(null)
  }

  // Member count per department
  function memberCount(deptId) {
    return people.filter(p => p.department_id === deptId).length
  }

  return (
    <div>

      {/* ── Add / Edit Form ── */}
      {showForm ? (
        <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(99,179,237,0.35)' }}>
          <div className="card-label" style={{ marginBottom: 14 }}>
            {editing ? 'Edit Department' : 'New Department'}
          </div>
          <form onSubmit={handleSave}>
            <div className="form-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
              <div className="form-group" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
                <label>Department Name *</label>
                <input
                  required autoFocus
                  value={form.name}
                  onChange={e => setF('name', e.target.value)}
                  placeholder="e.g. Pit Lane, Broadcast, Hospitality"
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Colour</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 4 }}>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setF('color', c)}
                      style={{
                        width: 26, height: 26,
                        borderRadius: '50%',
                        background: c,
                        border: form.color === c ? '3px solid var(--text)' : '2px solid transparent',
                        cursor: 'pointer',
                        boxShadow: form.color === c ? '0 0 0 1px var(--bg)' : 'none',
                        padding: 0,
                        transition: 'border 0.1s',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
                <button type="button" className="btn btn-ghost" onClick={cancelForm}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editing ? 'Save Changes' : 'Create Department'}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            + Add Department
          </button>
        </div>
      )}

      {/* ── Department list ── */}
      {departments.length === 0 ? (
        <div className="card">
          <div className="empty" style={{ padding: '24px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🏢</div>
            No departments yet. Add one above to get started.
            <br />
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Once created, assign team members to departments via People → Edit Person.
            </span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {departments.map(dept => {
            const count    = memberCount(dept.id)
            const members  = people
              .filter(p => p.department_id === dept.id)
              .sort((a, b) => a.name.localeCompare(b.name))

            return (
              <div key={dept.id} style={deptCard(dept.color)}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>

                  {/* Left: colour dot + name + member count */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={colorDot(dept.color)} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{dept.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
                        {count === 0 ? 'No members' : `${count} member${count > 1 ? 's' : ''}`}
                      </div>
                    </div>
                  </div>

                  {/* Right: action buttons */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => openEdit(dept)}>
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn-xs"
                      onClick={() => handleDelete(dept)}
                      disabled={deleting === dept.id}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Member roster */}
                {members.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {members.map(p => (
                      <span key={p.id} style={memberChip(dept.color)}>
                        {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Help text */}
      <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 18, lineHeight: 1.6 }}>
        <strong>Tip:</strong> After creating departments, assign team members via <strong>People → Edit Person → Department</strong>.
        Department Leads automatically manage the department linked to their own person record.
      </p>
    </div>
  )
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function deptCard(color) {
  return {
    background: 'var(--surface)',
    border: `1px solid ${color}55`,
    borderLeft: `4px solid ${color}`,
    borderRadius: 10,
    padding: '14px 16px',
  }
}

function colorDot(color) {
  return {
    width: 14, height: 14,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }
}

function memberChip(color) {
  return {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text)',
    background: `${color}18`,
    border: `1px solid ${color}44`,
    borderRadius: 4,
    padding: '2px 8px',
  }
}
