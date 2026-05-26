// ── Time utility functions ──
// All times are stored in the database as minutes from midnight (e.g. 09:00 = 540)

export function toMins(str) {
  if (!str) return 0
  const [h, m] = str.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function fromMins(m) {
  if (m == null) return ''
  const h   = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function durStr(m) {
  if (!m) return '0m'
  if (m < 60) return `${m}m`
  const h   = Math.floor(m / 60)
  const min = m % 60
  return min ? `${h}h ${min}m` : `${h}h`
}

// Effective start of an on-track session (accounts for all slips)
export function otStart(s) {
  return s.start_mins + (s.slip_mins || 0) + (s.cascade_slip_mins || 0)
}

// Effective end of an on-track session
export function otEnd(s) {
  return otStart(s) + (s.duration_override != null ? s.duration_override : s.duration_mins)
}

// Whether a session has been adjusted from its scheduled time
export function otAdjusted(s) {
  return (s.slip_mins || 0) !== 0 || s.duration_override != null || (s.cascade_slip_mins || 0) !== 0
}
