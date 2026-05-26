import { useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../context/ToastContext'
import { fromMins } from '../../lib/time'
import { getConflicts } from '../../lib/conflicts'

// Displays a modal for assigning on-track and area sessions to a person.
// Shows a conflict warning immediately when a new assignment would clash.
export default function AssignSessionsModal({
  person,
  days,
  onTrack,
  areaSessions,
  areas,
  people,        // full people list — needed to recompute conflicts
  onClose,
  onSaved,
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  // Local copies of assignment IDs — start from what the person currently has
  const [otIds, setOtIds] = useState(
    () => new Set((person.people_on_track || []).map(r => r.session_id))
  )
  const [asIds, setAsIds] = useState(
    () => new Set((person.people_area_sessions || []).map(r => r.area_session_id))
  )

  const sortedDays = [...days].sort((a, b) => a.sort_order - b.sort_order)

  // Build a synthetic people array with this person's updated assignments
  // so we can compute conflicts in real-time
  const syntheticPeople = useMemo(() => {
    return people.map(p => {
      if (p.id !== person.id) return p
      return {
        ...p,
        people_on_track:       [...otIds].map(id => ({ session_id: id })),
        people_area_sessions:  [...asIds].map(id => ({ area_session_id: id })),
      }
    })
  }, [people, person.id, otIds, asIds])

  const conflicts = useMemo(
    () => getConflicts(syntheticPeople, onTrack, areaSessions),
    [syntheticPeople, onTrack, areaSessions]
  )

  const myConflicts = conflicts.filter(c => c.person.id === person.id)

  function toggleOT(id) {
    setOtIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAS(id) {
    setAsIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)

    // Delete existing assignments then re-insert
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('people_on_track').delete().eq('person_id', person.id),
      supabase.from('people_area_sessions').delete().eq('person_id', person.id),
    ])
    if (e1 || e2) {
      toast('Error', (e1 || e2).message, 'danger')
      setSaving(false)
      return
    }

    const otRows = [...otIds].map(session_id => ({ person_id: person.id, session_id }))
    const asRows = [...asIds].map(area_session_id => ({ person_id: person.id, area_session_id }))

    const [{ error: e3 }, { error: e4 }] = await Promise.all([
      otRows.length ? supabase.from('people_on_track').insert(otRows) : Promise.resolve({}),
      asRows.length ? supabase.from('people_area_sessions').insert(asRows) : Promise.resolve({}),
    ])

    if (e3 || e4) {
      toast('Error', (e3 || e4).message, 'danger')
      setSaving(false)
    } else {
      toast('Assignments saved', person.name, 'success')
      onSaved()
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-title">Assign Sessions — {person.name}</div>

        {/* Conflict banner */}
        {myConflicts.length > 0 && (
          <div style={conflictBanner}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#ef4444' }}>
              ⚠ {myConflicts.length} scheduling conflict{myConflicts.length > 1 ? 's' : ''}
            </div>
            {myConflicts.map((c, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 3 }}>
                <strong>{c.sessionA.name}</strong> overlaps with <strong>{c.sessionB.name}</strong>
              </div>
            ))}
          </div>
        )}

        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {sortedDays.map(day => {
            const dayOT = onTrack
              .filter(s => s.day_id === day.id)
              .sort((a, b) => a.start_mins - b.start_mins)

            const dayAS = areaSessions
              .filter(s => s.day_id === day.id)
              .sort((a, b) => {
                // sort by area name then session name
                const aArea = areas.find(ar => ar.id === a.area_id)?.name || ''
                const bArea = areas.find(ar => ar.id === b.area_id)?.name || ''
                return aArea.localeCompare(bArea) || a.name.localeCompare(b.name)
              })

            if (dayOT.length === 0 && dayAS.length === 0) return null

            return (
              <div key={day.id} style={{ marginBottom: 20 }}>
                <div style={dayHeader}>{day.name}</div>

                {/* On-track sessions */}
                {dayOT.length > 0 && (
                  <>
                    <div style={groupLabel}>On-Track</div>
                    {dayOT.map(s => {
                      const checked   = otIds.has(s.id)
                      const hasConflict = myConflicts.some(
                        c => c.sessionA.id === s.id || c.sessionB.id === s.id
                      )
                      return (
                        <label key={s.id} style={rowStyle(checked, hasConflict)}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOT(s.id)}
                            style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: checked ? 600 : 400 }}>
                              {s.category ? <><strong>{s.category}</strong> — {s.name}</> : s.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                              {fromMins(s.start_mins)} · {s.duration_mins}m
                            </div>
                          </div>
                          {hasConflict && <span style={conflictDot} title="Conflict">⚠</span>}
                        </label>
                      )
                    })}
                  </>
                )}

                {/* Area sessions */}
                {dayAS.length > 0 && (
                  <>
                    <div style={groupLabel}>Activations</div>
                    {dayAS.map(s => {
                      const area      = areas.find(ar => ar.id === s.area_id)
                      const checked   = asIds.has(s.id)
                      const hasConflict = myConflicts.some(
                        c => c.sessionA.id === s.id || c.sessionB.id === s.id
                      )
                      return (
                        <label key={s.id} style={rowStyle(checked, hasConflict)}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAS(s.id)}
                            style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
                          />
                          {area && (
                            <div style={areaDot(area.color)} title={area.name} />
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: checked ? 600 : 400 }}>
                              {area ? <><strong>{area.name}</strong> — {s.name}</> : s.name}
                            </div>
                          </div>
                          {hasConflict && <span style={conflictDot} title="Conflict">⚠</span>}
                        </label>
                      )
                    })}
                  </>
                )}
              </div>
            )
          })}

          {onTrack.length === 0 && areaSessions.length === 0 && (
            <div className="empty" style={{ paddingTop: 20 }}>
              No sessions exist yet. Add sessions in Schedule or Activations first.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            {otIds.size + asIds.size} session{otIds.size + asIds.size !== 1 ? 's' : ''} assigned
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Assignments'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const conflictBanner = {
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 8,
  padding: '10px 14px',
  marginBottom: 16,
}

const dayHeader = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  padding: '6px 0 4px',
  borderBottom: '1px solid var(--border)',
  marginBottom: 8,
}

const groupLabel = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.7px',
  textTransform: 'uppercase',
  color: 'var(--text-dim)',
  margin: '8px 0 4px',
}

function rowStyle(checked, hasConflict) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    background: hasConflict
      ? 'rgba(239,68,68,0.06)'
      : checked
        ? 'rgba(99,102,241,0.07)'
        : 'transparent',
    border: `1px solid ${hasConflict ? 'rgba(239,68,68,0.25)' : 'transparent'}`,
    marginBottom: 2,
    transition: 'background 0.1s',
  }
}

function areaDot(color) {
  return {
    width: 10, height: 10,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }
}

const conflictDot = {
  fontSize: 13,
  color: '#ef4444',
  flexShrink: 0,
}
