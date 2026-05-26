import { useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useEvent } from '../../context/EventContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getConflicts, getConflictPersonIds } from '../../lib/conflicts'
import AddEditPersonModal  from '../modals/AddEditPersonModal'
import AssignSessionsModal from '../modals/AssignSessionsModal'

export default function PeopleView() {
  const { eventId, days, onTrack, areas, areaSessions, people, reload } = useEvent()
  const { isOpsOrAbove } = useAuth()
  const { toast } = useToast()

  const [search,          setSearch]          = useState('')
  const [showAdd,         setShowAdd]         = useState(false)
  const [editingPerson,   setEditingPerson]   = useState(null)
  const [assigningPerson, setAssigningPerson] = useState(null)
  const [deleting,        setDeleting]        = useState(null)

  // Compute conflicts for all people
  const conflicts        = useMemo(() => getConflicts(people, onTrack, areaSessions), [people, onTrack, areaSessions])
  const conflictPersonIds = useMemo(() => getConflictPersonIds(conflicts), [conflicts])

  const filtered = [...people]
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  async function deletePerson(p) {
    if (!confirm(`Remove "${p.name}" from this event?`)) return
    setDeleting(p.id)
    const { error } = await supabase.from('people').delete().eq('id', p.id)
    if (error) toast('Error', error.message, 'danger')
    else { toast('Removed', p.name, 'success'); reload() }
    setDeleting(null)
  }

  // Count assignments for a person
  function assignmentCount(p) {
    const ot = (p.people_on_track || []).length
    const as = (p.people_area_sessions || []).length
    return ot + as
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="sec-header" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="sec-title">Team Members</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>({people.length})</span>
          {conflictPersonIds.size > 0 && (
            <span style={conflictChip}>
              ⚠ {conflictPersonIds.size} conflict{conflictPersonIds.size > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {isOpsOrAbove && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            + Add Person
          </button>
        )}
      </div>

      {/* ── Search ── */}
      {people.length > 0 && (
        <input
          type="search"
          placeholder="Search team members…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text)', padding: '8px 12px', borderRadius: 'var(--radius)',
            fontSize: 13, width: '100%', maxWidth: 340, marginBottom: 16,
          }}
        />
      )}

      {/* ── Empty state ── */}
      {people.length === 0 && (
        <div className="empty">
          <div style={{ fontSize: 28, marginBottom: 10 }}>👥</div>
          No team members added yet.
          {isOpsOrAbove && <><br />Click <strong>+ Add Person</strong> to get started, or import via Admin → Excel Import.</>}
        </div>
      )}

      {/* ── People grid ── */}
      {filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
          {filtered.map(p => {
            const hasConflict = conflictPersonIds.has(p.id)
            const count       = assignmentCount(p)

            return (
              <div key={p.id} style={cardStyle(hasConflict)}>

                {/* Name + conflict indicator */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                  {hasConflict && (
                    <span style={conflictBadge} title="Scheduling conflict detected">⚠</span>
                  )}
                </div>

                {/* Assignment count */}
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
                  {count === 0 ? 'No sessions assigned' : `${count} session${count > 1 ? 's' : ''} assigned`}
                </div>

                {/* Contact details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                  {p.phone_whatsapp && (
                    <div style={detailStyle}>
                      <span>📱</span>
                      <span style={{ color: 'var(--text-mid)', fontSize: 12 }}>{p.phone_whatsapp}</span>
                    </div>
                  )}
                  {p.radio_channel && (
                    <div style={detailStyle}>
                      <span>📻</span>
                      <span style={{ color: 'var(--text-mid)', fontSize: 12 }}>{p.radio_channel}</span>
                    </div>
                  )}
                  {!p.phone_whatsapp && !p.radio_channel && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No contact info</div>
                  )}
                </div>

                {/* Actions */}
                {isOpsOrAbove && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => setAssigningPerson(p)}
                    >
                      Assign Sessions
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => setEditingPerson(p)}>
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn-xs"
                      onClick={() => deletePerson(p)}
                      disabled={deleting === p.id}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── No search results ── */}
      {people.length > 0 && filtered.length === 0 && (
        <div className="empty">No team members match "{search}"</div>
      )}

      {/* ── Modals ── */}
      {(showAdd || editingPerson) && (
        <AddEditPersonModal
          person={editingPerson}
          eventId={eventId}
          onClose={() => { setShowAdd(false); setEditingPerson(null) }}
          onSaved={() => { setShowAdd(false); setEditingPerson(null); reload() }}
        />
      )}

      {assigningPerson && (
        <AssignSessionsModal
          person={assigningPerson}
          days={days}
          onTrack={onTrack}
          areaSessions={areaSessions}
          areas={areas}
          people={people}
          onClose={() => setAssigningPerson(null)}
          onSaved={() => { setAssigningPerson(null); reload() }}
        />
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

function cardStyle(hasConflict) {
  return {
    background:   'var(--surface2)',
    border:       `1px solid ${hasConflict ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
    borderRadius: 'var(--radius)',
    padding:      '14px',
    transition:   'border-color 0.15s',
  }
}

const detailStyle = {
  display:    'flex',
  alignItems: 'center',
  gap:        6,
  fontSize:   12,
}

const conflictChip = {
  fontSize: 11,
  fontWeight: 700,
  color: '#ef4444',
  background: 'rgba(239,68,68,0.1)',
  border: '1px solid rgba(239,68,68,0.25)',
  borderRadius: 4,
  padding: '2px 8px',
}

const conflictBadge = {
  fontSize: 13,
  color: '#ef4444',
  lineHeight: 1,
  flexShrink: 0,
}
