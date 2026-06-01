/**
 * sendSlipNotifications
 *
 * Sends WhatsApp messages to all team members whose sessions moved.
 * Returns { sent: number, skipped: number, errors: string[] } for caller feedback.
 *
 * @param {object} params
 *   updates       – array of { id } returned by getCascadeUpdates
 *   cascaded      – full array from applyCascade (post-update state)
 *   onTrack       – original onTrack array from context (pre-update, for "was X" comparison)
 *   areaSessions  – all area sessions for the event
 *   people        – all people for the event (with people_on_track, people_area_sessions)
 *   dayName       – display name of the active day (e.g. "Friday")
 *   slipDelta     – how many minutes were added (+) or removed (-)
 *   supabase      – the supabase client instance
 */
import { fromMins } from './time'

export async function sendSlipNotifications({
  updates, cascaded, onTrack, areaSessions, people, dayName, slipDelta, supabase,
}) {
  const changedIds  = new Set(updates.map(u => u.id))
  const cascadedMap = new Map(cascaded.map(s => [s.id, s]))

  // Activations whose start time depends on a changed on-track session
  const affectedAreas   = areaSessions.filter(as =>
    as.dep_type === 'after' && changedIds.has(as.dep_session_id)
  )
  const affectedAreaIds = new Set(affectedAreas.map(as => as.id))
  const affectedAreaMap = new Map(affectedAreas.map(as => [as.id, as]))

  // Build one notification per person who has at least one affected session
  const notifications = []
  for (const person of people) {
    if (!person.phone_whatsapp) continue

    // On-track sessions this person is assigned to that moved
    const onTrackLines = (person.people_on_track || [])
      .filter(pot => changedIds.has(pot.session_id))
      .map(pot => {
        const s = cascadedMap.get(pot.session_id)
        if (!s) return null
        const newStart = s.start_mins + (s.slip_mins || 0) + (s.cascade_slip_mins || 0)
        const sOrig    = onTrack.find(o => o.id === pot.session_id)
        const oldStart = sOrig
          ? sOrig.start_mins + (sOrig.slip_mins || 0) + (sOrig.cascade_slip_mins || 0)
          : null
        const sessionLabel = s.category ? `${s.category} — ${s.name}` : s.name
        const timeStr = (oldStart != null && oldStart !== newStart)
          ? `${fromMins(oldStart)} → ${fromMins(newStart)}`
          : fromMins(newStart)
        return `• ${sessionLabel}: ${timeStr}`
      })
      .filter(Boolean)

    // Activations this person is assigned to that moved
    const areaLines = (person.people_area_sessions || [])
      .filter(pas => affectedAreaIds.has(pas.area_session_id))
      .map(pas => {
        const as     = affectedAreaMap.get(pas.area_session_id)
        const linked = cascadedMap.get(as.dep_session_id)
        if (linked) {
          const linkedNewStart = linked.start_mins + (linked.slip_mins || 0) + (linked.cascade_slip_mins || 0)
          const linkedDur      = linked.duration_override ?? linked.duration_mins
          const linkedNewEnd   = linkedNewStart + linkedDur
          const newStart       = linkedNewEnd + (as.dep_offset_mins || 0)
          const linkedOrig     = onTrack.find(o => o.id === linked.id)
          let oldStart = null
          if (linkedOrig) {
            const linkedOldStart = linkedOrig.start_mins + (linkedOrig.slip_mins || 0) + (linkedOrig.cascade_slip_mins || 0)
            const linkedOldDur   = linkedOrig.duration_override ?? linkedOrig.duration_mins
            oldStart = linkedOldStart + linkedOldDur + (as.dep_offset_mins || 0)
          }
          const timeStr = (oldStart != null && oldStart !== newStart)
            ? `${fromMins(oldStart)} → ${fromMins(newStart)}`
            : fromMins(newStart)
          return `• ${as.name}: ${timeStr}`
        }
        return `• ${as.name}: ${fromMins(as.start_mins)}`
      })

    const allLines = [...onTrackLines, ...areaLines]
    if (allLines.length > 0) notifications.push({ person, allLines })
  }

  if (notifications.length === 0) {
    return { sent: 0, skipped: 0, errors: [], noRecipients: true }
  }

  // Send — await all so we can surface any errors
  let sent = 0
  const errors = []

  await Promise.all(notifications.map(async ({ person, allLines }) => {
    const message = slipDelta > 0
      ? `⚠️ *Schedule Update — ADL Grand Final*\n\nThe following sessions on your schedule have moved:\n\n${allLines.join('\n')}\n\n📅 ${dayName}`
      : `✅ *Schedule Recovery — ADL Grand Final*\n\nThe following sessions on your schedule have been updated:\n\n${allLines.join('\n')}\n\n📅 ${dayName}`

    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: { recipients: [{ name: person.name, phone: person.phone_whatsapp }], message },
      })
      if (error) {
        errors.push(`${person.name}: ${error.message}`)
      } else if (data?.results?.[0]?.error) {
        errors.push(`${person.name}: ${data.results[0].error}`)
      } else {
        sent++
      }
    } catch (err) {
      errors.push(`${person.name}: ${err.message}`)
    }
  }))

  return { sent, skipped: notifications.length - sent - errors.length, errors, noRecipients: false }
}
