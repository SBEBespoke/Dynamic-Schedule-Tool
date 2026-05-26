import { otStart, otEnd } from './time'

// ── Cascade engine ────────────────────────────────────────────────────────────
//
// Given a day's on-track sessions and a proposed slip change for one session,
// returns the full updated set of sessions with correct cascade_slip_mins values.
//
// Rules:
//  • Sessions are processed in scheduled start order (start_mins).
//  • A "cursor" tracks the furthest end time reached so far.
//  • If a session's manual start (start_mins + slip_mins) falls before the cursor,
//    it gets a cascade_slip_mins to push it to the cursor.
//  • Sessions with must_start_at are pinned — cascade doesn't move them, but their
//    end time still advances the cursor for subsequent sessions.
//  • Sessions with must_finish_by have their duration_override clamped so they
//    don't run past the deadline, regardless of slip.

export function applyCascade(sessions, changedId, newSlipMins) {
  // 1. Apply the manual slip change to the target session
  const updated = sessions.map(s =>
    s.id === changedId
      ? { ...s, slip_mins: newSlipMins }
      : s
  )

  // 2. Sort by scheduled start for cascade walk
  const sorted = [...updated].sort((a, b) => a.start_mins - b.start_mins)

  // 3. Walk sessions in order, propagating the cursor
  let endCursor = 0
  const cascaded = sorted.map(s => {
    const manualStart = s.start_mins + (s.slip_mins || 0)

    if (s.must_start_at != null) {
      // Pinned session — cascade doesn't apply, but it still advances the cursor
      const pinnedStart = s.must_start_at
      const baseDur     = s.duration_override ?? s.duration_mins
      // If must_finish_by: clamp duration so it doesn't overrun
      const dur = s.must_finish_by != null
        ? Math.min(baseDur, s.must_finish_by - pinnedStart)
        : baseDur
      endCursor = Math.max(endCursor, pinnedStart + dur)
      return { ...s, cascade_slip_mins: 0, duration_override: dur < baseDur ? dur : s.duration_override }
    }

    // How much do we need to push this session?
    const cascade    = Math.max(0, endCursor - manualStart)
    const thisStart  = manualStart + cascade
    const baseDur    = s.duration_override ?? s.duration_mins

    // Clamp to must_finish_by if set
    const dur = s.must_finish_by != null
      ? Math.min(baseDur, s.must_finish_by - thisStart)
      : baseDur

    endCursor = Math.max(endCursor, thisStart + dur)

    return {
      ...s,
      cascade_slip_mins: cascade,
      duration_override: (s.must_finish_by != null && dur < baseDur) ? dur : s.duration_override,
    }
  })

  return cascaded
}

// ── Diff helper ───────────────────────────────────────────────────────────────
// Returns only the sessions whose cascade_slip_mins changed, as DB update payloads.
export function getCascadeUpdates(before, after) {
  const updates = []
  after.forEach(a => {
    const b = before.find(s => s.id === a.id)
    if (!b) return
    if (
      a.cascade_slip_mins !== b.cascade_slip_mins ||
      a.slip_mins         !== b.slip_mins         ||
      a.duration_override !== b.duration_override
    ) {
      updates.push({
        id:                a.id,
        slip_mins:         a.slip_mins,
        cascade_slip_mins: a.cascade_slip_mins,
        duration_override: a.duration_override ?? null,
      })
    }
  })
  return updates
}
