import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEvent } from '../../context/EventContext'
import { useToast } from '../../context/ToastContext'

const ROLES = [
  { value: 'team_member', label: 'Team Member' },
  { value: 'ops_lead',    label: 'Ops Lead' },
  { value: 'super_admin', label: 'Administrator' },
]

const ROLE_LABELS = {
  team_member: 'Team Member',
  ops_lead:    'Ops Lead',
  super_admin: 'Administrator',
}

export default function UsersTab() {
  const { user: currentUser } = useAuth()
  const { people, reload: reloadEvent } = useEvent()
  const { toast } = useToast()

  const [users,    setUsers]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(null)   // userId being saved
  const [deleting, setDeleting] = useState(null)   // userId being deleted
  const [search,   setSearch]   = useState('')

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting,    setInviting]    = useState(false)

  // ── Fetch users from edge function ─────────────────────────────────────────
  async function loadUsers() {
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'list' },
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error || 'Failed to load users')
      setUsers(data.users || [])
    } catch (err) {
      toast('Error loading users', err.message, 'danger')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Change role (direct to user_profiles — super_admin RLS allows) ─────────
  async function changeRole(userId, newRole) {
    if (userId === currentUser?.id) {
      toast('Not allowed', 'You cannot change your own role', 'warn'); return
    }
    setSaving(userId)
    const { error } = await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) {
      toast('Error', error.message, 'danger')
    } else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
      toast('Role updated', `Set to ${ROLE_LABELS[newRole]}`, 'success')
    }
    setSaving(null)
  }

  // ── Link person record to user ─────────────────────────────────────────────
  async function linkPerson(userId, personId) {
    setSaving(userId)

    // Find if this user is already linked to someone in this event
    const currentLinked = people.find(p => p.linked_user_id === userId)

    // Unlink previous (only within this event's people)
    if (currentLinked && currentLinked.id !== personId) {
      await supabase.from('people').update({ linked_user_id: null }).eq('id', currentLinked.id)
    }

    // Apply new link (or clear if empty)
    if (personId) {
      const { error } = await supabase
        .from('people')
        .update({ linked_user_id: userId })
        .eq('id', personId)
      if (error) {
        toast('Error', error.message, 'danger')
        setSaving(null)
        return
      }
    }

    toast('Updated', personId ? 'Person record linked' : 'Person unlinked', 'success')
    await reloadEvent()
    setSaving(null)
  }

  // ── Send password reset email (client-side — any admin can trigger) ─────────
  async function sendReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href,
    })
    if (error) toast('Error', error.message, 'danger')
    else toast('Reset sent', `Password reset email sent to ${email}`, 'success')
  }

  // ── Delete user (via edge function — needs service role) ───────────────────
  async function deleteUser(userId, name) {
    if (userId === currentUser?.id) {
      toast('Not allowed', 'You cannot remove your own account', 'warn'); return
    }
    if (!confirm(`Remove user "${name}"?\n\nThis will delete their login account. Their team member record and all session assignments will be kept.`)) return
    setDeleting(userId)
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'delete', userId },
    })
    if (error || !data?.ok) {
      toast('Error', error?.message || data?.error || 'Delete failed', 'danger')
    } else {
      toast('Removed', `${name} has been removed`, 'success')
      loadUsers()
      reloadEvent()
    }
    setDeleting(null)
  }

  // ── Invite user by email (via edge function) ───────────────────────────────
  async function handleInvite(e) {
    e.preventDefault()
    setInviting(true)
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'invite', email: inviteEmail.trim() },
    })
    if (error || !data?.ok) {
      toast('Invite failed', error?.message || data?.error || 'Unknown error', 'danger')
    } else {
      toast('Invite sent', `${inviteEmail} will receive a sign-in link`, 'success')
      setInviteEmail('')
      setTimeout(loadUsers, 1500) // refresh after a moment so the new user row appears
    }
    setInviting(false)
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  // Map userId → linked person record (for this event)
  const linkedByUserId = {}
  people.forEach(p => { if (p.linked_user_id) linkedByUserId[p.linked_user_id] = p })

  // People with no linked user — available to link
  const unlinkedPeople = people.filter(p => !p.linked_user_id)

  // Search filter
  const filtered = users
    .filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Role breakdown counts
  const counts = { super_admin: 0, ops_lead: 0, team_member: 0 }
  users.forEach(u => { if (counts[u.role] !== undefined) counts[u.role]++ })

  return (
    <div>

      {/* ── Invite panel ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-label" style={{ marginBottom: 10 }}>Invite User by Email</div>
        <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 14, lineHeight: 1.6 }}>
          Send a sign-in link directly to someone's inbox. They'll set their own password when they
          first log in. All invited accounts start as <strong>Team Member</strong>.
        </p>
        <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, maxWidth: 500 }}>
          <input
            type="email"
            placeholder="name@example.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            required
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" disabled={inviting}>
            {inviting ? 'Sending…' : '✉ Send Invite'}
          </button>
        </form>
      </div>

      {/* ── User table ── */}
      <div className="card" style={{ overflowX: 'auto' }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="card-label" style={{ marginBottom: 0 }}>
              All Users ({users.length})
            </div>
            {/* Role breakdown chips */}
            {!loading && (
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={roleChip('super_admin')}>{counts.super_admin} Admin</span>
                <span style={roleChip('ops_lead')}>{counts.ops_lead} Ops</span>
                <span style={roleChip('team_member')}>{counts.team_member} Team</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={searchStyle}
            />
            <button className="btn btn-ghost btn-sm" onClick={loadUsers} disabled={loading}>
              ↺ Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '20px 0', color: 'var(--text-dim)', fontSize: 13, textAlign: 'center' }}>
            Loading users…
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            {search ? `No users match "${search}"` : 'No users found.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Name', 'Email', 'Role', 'Linked Person', 'Last Active', 'Actions'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const linked     = linkedByUserId[u.id]
                const isSelf     = u.id === currentUser?.id
                const isSaving   = saving   === u.id
                const isDeleting = deleting === u.id

                return (
                  <tr key={u.id} style={{ opacity: isDeleting ? 0.4 : 1, transition: 'opacity 0.2s' }}>

                    {/* Name */}
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                      {isSelf && (
                        <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 1 }}>You</div>
                      )}
                    </td>

                    {/* Email */}
                    <td style={tdStyle}>
                      <span style={{ color: 'var(--text-mid)', fontSize: 12 }}>{u.email}</span>
                    </td>

                    {/* Role dropdown */}
                    <td style={tdStyle}>
                      <select
                        value={u.role}
                        disabled={isSelf || isSaving}
                        onChange={e => changeRole(u.id, e.target.value)}
                        style={roleSelectStyle(u.role, isSelf)}
                        title={isSelf ? 'You cannot change your own role' : ''}
                      >
                        {ROLES.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>

                    {/* Linked person dropdown */}
                    <td style={tdStyle}>
                      <select
                        value={linked?.id || ''}
                        disabled={isSaving}
                        onChange={e => linkPerson(u.id, e.target.value)}
                        style={linkSelectStyle(!!linked)}
                      >
                        <option value="">— none —</option>
                        {/* Show current linked person even if it would otherwise not appear */}
                        {linked && (
                          <option value={linked.id}>{linked.name}</option>
                        )}
                        {unlinkedPeople
                          .filter(p => p.id !== linked?.id)
                          .map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))
                        }
                      </select>
                    </td>

                    {/* Last active */}
                    <td style={tdStyle}>
                      <span style={{ color: 'var(--text-dim)', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {u.last_sign_in_at
                          ? new Date(u.last_sign_in_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })
                          : 'Never'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => sendReset(u.email)}
                          title="Send password reset email"
                        >
                          Reset PW
                        </button>
                        {!isSelf && (
                          <button
                            className="btn btn-danger btn-xs"
                            onClick={() => deleteUser(u.id, u.name)}
                            disabled={isDeleting || !!deleting}
                            title="Remove this user's account"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Help note */}
      <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 14, lineHeight: 1.6 }}>
        <strong>Linked Person</strong> connects a user account to a team member record, enabling their personal schedule, checklist assignments, and Join buttons.
        Only people from the current event are shown in this list.
      </p>
    </div>
  )
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function roleChip(role) {
  const map = {
    super_admin: { color: '#c084fc', bg: 'rgba(192,132,252,0.1)', border: 'rgba(192,132,252,0.25)' },
    ops_lead:    { color: 'var(--accent)', bg: 'rgba(99,179,237,0.1)', border: 'rgba(99,179,237,0.25)' },
    team_member: { color: 'var(--text-mid)', bg: 'var(--surface2)', border: 'var(--border)' },
  }
  const c = map[role]
  return {
    fontSize: 11, fontWeight: 600,
    color: c.color, background: c.bg,
    border: `1px solid ${c.border}`,
    borderRadius: 4, padding: '2px 7px',
  }
}

function roleSelectStyle(role, isSelf) {
  const map = {
    super_admin: { color: '#c084fc', bg: 'rgba(192,132,252,0.08)', border: 'rgba(192,132,252,0.3)' },
    ops_lead:    { color: 'var(--accent)', bg: 'rgba(99,179,237,0.08)', border: 'rgba(99,179,237,0.3)' },
    team_member: { color: 'var(--text-mid)', bg: 'var(--surface2)', border: 'var(--border)' },
  }
  const c = map[role] || map.team_member
  return {
    background:  isSelf ? 'var(--surface2)' : c.bg,
    border:      `1px solid ${isSelf ? 'var(--border)' : c.border}`,
    color:       isSelf ? 'var(--text-dim)' : c.color,
    borderRadius: 4,
    padding:     '4px 6px',
    fontSize:    12,
    fontWeight:  600,
    cursor:      isSelf ? 'not-allowed' : 'pointer',
    minWidth:    110,
  }
}

function linkSelectStyle(hasLink) {
  return {
    background:  hasLink ? 'rgba(34,197,94,0.08)' : 'var(--surface2)',
    border:      `1px solid ${hasLink ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
    color:       hasLink ? 'var(--success)' : 'var(--text-dim)',
    borderRadius: 4,
    padding:     '4px 6px',
    fontSize:    12,
    cursor:      'pointer',
    minWidth:    130,
  }
}

const searchStyle = {
  background:  'var(--surface2)',
  border:      '1px solid var(--border)',
  color:       'var(--text)',
  padding:     '5px 10px',
  borderRadius: 'var(--radius)',
  fontSize:    13,
  width:       180,
}

const thStyle = {
  textAlign:      'left',
  padding:        '6px 10px',
  borderBottom:   '1px solid var(--border)',
  color:          'var(--text-dim)',
  fontWeight:     600,
  fontSize:       11,
  textTransform:  'uppercase',
  letterSpacing:  '0.5px',
  whiteSpace:     'nowrap',
}

const tdStyle = {
  padding:      '9px 10px',
  borderBottom: '1px solid var(--border)',
  color:        'var(--text)',
  verticalAlign: 'middle',
}
