import { otStart, otEnd } from './time'

// ── Area session timing ──────────────────────────────────────────────────────

export function areaStart(session, onTrack) {
  if (session.dep_type === 'after' && session.dep_session_id) {
    const dep = onTrack.find(s => s.id === session.dep_session_id)
    if (dep) return otEnd(dep) + (session.dep_offset_mins || 0)
  }
  return session.start_mins
}

export function areaEnd(session, onTrack) {
  const start = areaStart(session, onTrack)
  if (session.fin_dep_type === 'otStart' && session.fin_dep_session_id) {
    const dep = onTrack.find(s => s.id === session.fin_dep_session_id)
    if (dep) return otStart(dep) + (session.fin_dep_offset_mins || 0)
  }
  if (session.fin_dep_type === 'otEnd' && session.fin_dep_session_id) {
    const dep = onTrack.find(s => s.id === session.fin_dep_session_id)
    if (dep) return otEnd(dep) + (session.fin_dep_offset_mins || 0)
  }
  return start + (session.duration_mins || 0)
}

export function isAreaSlipped(session, onTrack) {
  if (session.dep_type !== 'after' || !session.dep_session_id) return false
  const dep = onTrack.find(s => s.id === session.dep_session_id)
  return dep && ((dep.slip_mins || 0) !== 0 || (dep.cascade_slip_mins || 0) !== 0)
}

// ── Conflict detection ───────────────────────────────────────────────────────

// Returns an array of conflict objects:
// { person, sessionA: {id, name, start, end, dayId}, sessionB: {...} }
export function getConflicts(people, onTrack, areaSessions) {
  const conflicts = []

  people.forEach(person => {
    const assignments = []

    // On-track sessions assigned to this person
    const otIds = (person.people_on_track || []).map(r => r.session_id)
    otIds.forEach(id => {
      const s = onTrack.find(x => x.id === id)
      if (s) assignments.push({
        id:    s.id,
        name:  s.category ? `${s.category} — ${s.name}` : s.name,
        dayId: s.day_id,
        start: otStart(s),
        end:   otEnd(s),
        type:  'ontrack',
      })
    })

    // Area sessions assigned to this person
    const asIds = (person.people_area_sessions || []).map(r => r.area_session_id)
    asIds.forEach(id => {
      const s = areaSessions.find(x => x.id === id)
      if (s) assignments.push({
        id:    s.id,
        name:  s.name,
        dayId: s.day_id,
        start: areaStart(s, onTrack),
        end:   areaEnd(s, onTrack),
        type:  'area',
      })
    })

    // Check every pair for overlap on the same day
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        const a = assignments[i]
        const b = assignments[j]
        if (a.dayId === b.dayId && a.start < b.end && b.start < a.end) {
          conflicts.push({ person, sessionA: a, sessionB: b })
        }
      }
    }
  })

  return conflicts
}

// Returns a Set of person IDs who have at least one conflict
export function getConflictPersonIds(conflicts) {
  const ids = new Set()
  conflicts.forEach(c => ids.add(c.person.id))
  return ids
}
