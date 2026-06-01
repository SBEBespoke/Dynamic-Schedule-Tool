/**
 * DepartmentView
 *
 * Department Lead (ops_lead):
 *   - Sees all people in their department
 *   - Views each person's joined on-track sessions and activations
 *   - Can open AssignSessionsModal to update assignments
 *   - Can navigate to Checklist to assign tasks
 *
 * Team Member:
 *   - Read-only directory of department colleagues
 *   - Can see colleagues' sessions at a glance
 *
 * Super Admin: scoped to MY person record's dept_id (or shows all depts if no dept assigned)
 */
import { useState } from 'react'
import { useEvent } from '../../context/EventContext'
import { useAuth } from '../../context/AuthContext'
import { useViewAuth } from '../../context/ViewContext'
import { fromMins, otStart, otEnd } from '../../lib/time'
import { areaStart, areaEnd } from '../../lib/conflicts'
import AssignSessionsModal from '../modals/AssignSessionsModal'

export default function DepartmentView() {
  const { departments, people, days, onTrack, areas, areaSessions, reload } = useEvent()
  const { profile } = useAuth()
  const { effectiveIsOpsOrAbove: isOpsOrAbove, myDepartmentId } = useViewAuth()

  const [assigningPerson, setAssigningPerson] = useState(null)

  // Who am I?
  const me = people.find(p => p.linked_user_id === profile?.id)

  // Which department to show?
  // - ops_lead: their own dept (myDepartmentId = me.department_id)
  // - team_member: their own dept (same)
  // - super_admin viewing as themselves: myDepartmentId (from their person record, if any)
  const myDept = departments.find(d => d.id === myDepartmentId)
  const deptPeople = myDepartmentId
    ? [...people]
        .filter(p => p.department_id === myDepartmentId)
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  // ── No department set ──
  if (!myDepartmentId || !myDept) {
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>No Department Assigned</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>
          You haven't been assigned to a department yet.
          <br />Contact your administrator to be added to a department.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* ── Department header ── */}
      <div className="sec-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={colorDot(myDept.color)} />
          <span className="sec-title">{myDept.name}</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            ({deptPeople.length} member{deptPeople.length !== 1 ? 's' : ''})
          </span>
        </div>
      </div>

      {/* ── Empty department ── */}
      {deptPeople.length === 0 && (
        <div className="empty">
          <div style={{ fontSize: 28, marginBottom: 10 }}>👥</div>
          No team members in this department yet.
        </div>
      )}

      {/* ── People cards ── */}
      {deptPeople.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>
          {deptPeople.map(person => (
            <PersonCard
              key={person.id}
              person={person}
              days={days}
              onTrack={onTrack}
              areaSessions={areaSessions}
              areas={areas}
              isOpsOrAbove={isOpsOrAbove}
              isSelf={person.id === me?.id}
              onAssign={() => setAssigningPerson(person)}
            />
          ))}
        </div>
      )}

      {/* ── Assign sessions modal ── */}
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

// ── Person card ───────────────────────────────────────────────────────────────

function PersonCard({ person, days, onTrack, areaSessions, areas, isOpsOrAbove, isSelf, onAssign }) {
  const [expanded, setExpanded] = useState(false)

  // Joined on-track sessions
  const joinedOT = (person.people_on_track || [])
    .map(pot => onTrack.find(s => s.id === pot.session_id))
    .filter(Boolean)
    .sort((a, b) => {
      // Sort by day sort_order, then by start time
      const dayA = days.find(d => d.id === a.day_id)
      const dayB = days.find(d => d.id === b.day_id)
      const dayDiff = (dayA?.sort_order || 0) - (dayB?.sort_order || 0)
      return dayDiff !== 0 ? dayDiff : otStart(a) - otStart(b)
    })

  // Joined area sessions
  const joinedAS = (person.people_area_sessions || [])
    .map(pas => areaSessions.find(s => s.id === pas.area_session_id))
    .filter(Boolean)
    .sort((a, b) => areaStart(a, onTrack) - areaStart(b, onTrack))

  const totalAssigned = joinedOT.length + joinedAS.length

  return (
    <div style={cardStyle(isSelf)}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {person.name}
            {isSelf && <span style={selfBadge}>You</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
            {totalAssigned === 0
              ? 'No sessions assigned'
              : `${totalAssigned} session${totalAssigned > 1 ? 's' : ''} assigned`}
          </div>
        </div>
        {totalAssigned > 0 && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setExpanded(x => !x)}
          >
            {expanded ? '▲ Hide' : '▼ Show'}
          </button>
        )}
      </div>

      {/* Contact */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
        {person.phone_whatsapp && (
          <div style={detailRow}>
            <span>📱</span>
            <span style={{ color: 'var(--text-mid)', fontSize: 12 }}>{person.phone_whatsapp}</span>
          </div>
        )}
        {person.radio_channel && (
          <div style={detailRow}>
            <span>📻</span>
            <span style={{ color: 'var(--text-mid)', fontSize: 12 }}>{person.radio_channel}</span>
          </div>
        )}
        {!person.phone_whatsapp && !person.radio_channel && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No contact info</div>
        )}
      </div>

      {/* Session list — expanded */}
      {expanded && totalAssigned > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 8 }}>
          {joinedOT.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={sectionLabel}>On Track</div>
              {joinedOT.map(s => {
                const dayName = days.find(d => d.id === s.day_id)?.name
                return (
                  <div key={s.id} style={sessionRow}>
                    <span style={{ fontSize: 11, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                      {fromMins(otStart(s))}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>
                      {s.category ? `${s.category} — ` : ''}{s.name}
                    </span>
                    {dayName && (
                      <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>{dayName}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {joinedAS.length > 0 && (
            <div>
              <div style={sectionLabel}>Activations</div>
              {joinedAS.map(s => {
                const area = areas.find(a => a.id === s.area_id)
                const start = areaStart(s, onTrack)
                return (
                  <div key={s.id} style={sessionRow}>
                    {start != null && (
                      <span style={{ fontSize: 11, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                        {fromMins(start)}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>
                      {s.name}
                    </span>
                    {area && (
                      <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>{area.name}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Assign button — ops only */}
      {isOpsOrAbove && (
        <button
          className="btn btn-ghost btn-xs"
          onClick={onAssign}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          ✏ Manage Sessions
        </button>
      )}
    </div>
  )
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function colorDot(color) {
  return {
    width: 14, height: 14,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }
}

function cardStyle(isSelf) {
  return {
    background: isSelf ? 'rgba(99,179,237,0.06)' : 'var(--surface)',
    border: `1px solid ${isSelf ? 'rgba(99,179,237,0.35)' : 'var(--border)'}`,
    borderRadius: 'var(--radius)',
    padding: '14px',
    transition: 'border-color 0.15s',
  }
}

const selfBadge = {
  display: 'inline-block',
  marginLeft: 6,
  fontSize: 9,
  fontWeight: 700,
  color: 'var(--accent)',
  background: 'rgba(99,179,237,0.15)',
  border: '1px solid rgba(99,179,237,0.35)',
  borderRadius: 3,
  padding: '1px 5px',
  verticalAlign: 'middle',
  letterSpacing: '0.3px',
  textTransform: 'uppercase',
}

const detailRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
}

const sectionLabel = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.8px',
  textTransform: 'uppercase',
  color: 'var(--text-dim)',
  marginBottom: 4,
}

const sessionRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 0',
  borderBottom: '1px solid var(--border)',
}
