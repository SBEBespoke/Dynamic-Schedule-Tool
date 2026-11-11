// Supabase Edge Function — send-reminders
// Called every minute by a pg_cron job.
// Sends WhatsApp reminders to anyone with a session starting in ~15 minutes.
//
// Auto-available secrets:
//   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
//
// Set in Dashboard → Project Settings → Edge Functions → Secrets:
//   TWILIO_ACCOUNT_SID · TWILIO_AUTH_TOKEN · TWILIO_WHATSAPP_FROM

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// Adelaide local time (handles ACST/ACDT automatically)
function getAdelaideTime(): { todayStr: string; currentMins: number } {
  const now   = new Date()
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Adelaide',
    hour: 'numeric', minute: 'numeric', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get   = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
  const hour  = parseInt(get('hour'))
  const min   = parseInt(get('minute'))
  return {
    todayStr:    `${get('year')}-${get('month')}-${get('day')}`,
    currentMins: hour * 60 + min,
  }
}

function minsToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

async function sendWhatsApp(
  phone: string, message: string,
  sid: string, token: string, from: string
): Promise<{ ok: boolean; error?: string }> {
  const to   = (phone.replace(/\s+/g, '')).startsWith('whatsapp:')
    ? phone.replace(/\s+/g, '')
    : `whatsapp:${phone.replace(/\s+/g, '')}`
  const body = new URLSearchParams({ From: from, To: to, Body: message })
  const res  = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization:  `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    }
  )
  const r = await res.json()
  return r.sid ? { ok: true } : { ok: false, error: r.message }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const twilioSid   = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const twilioFrom  = Deno.env.get('TWILIO_WHATSAPP_FROM')!

    if (!twilioSid || !twilioToken || !twilioFrom) {
      return json({ ok: false, error: 'Twilio credentials not configured' }, 500)
    }

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { todayStr, currentMins } = getAdelaideTime()
    // 2-minute window centred on +15 to absorb any cron timing jitter
    const winMin = currentMins + 14
    const winMax = currentMins + 16

    console.log(`send-reminders: ${todayStr} now=${minsToTime(currentMins)} window=${minsToTime(winMin)}–${minsToTime(winMax)}`)

    // Days with sessions today
    const { data: days, error: daysErr } = await db
      .from('days').select('id, name, event_id').eq('date', todayStr)
    if (daysErr) throw daysErr
    if (!days?.length) return json({ ok: true, message: 'No event days today', todayStr })

    const dayIds  = days.map(d => d.id)
    const dayMap  = new Map(days.map(d => [d.id, d]))
    const evtIds  = [...new Set(days.map(d => d.event_id))]

    const { data: events } = await db.from('events').select('id, name').in('id', evtIds)
    const evtMap  = new Map((events ?? []).map(e => [e.id, e]))

    let sent = 0, skipped = 0
    const errors: string[] = []

    // ── Shared helper: send one reminder and log it ──────────────────
    async function remind(
      sessionId: string, sessionType: 'on_track' | 'activation',
      eventId: string, person: { id: string; name: string; phone_whatsapp: string },
      label: string, startMins: number, dayId: string,
    ) {
      if (!person.phone_whatsapp) { skipped++; return }

      // Deduplicate — one reminder per person per session per day
      const { data: dup } = await db.from('reminder_log').select('id')
        .eq('session_id', sessionId).eq('session_type', sessionType)
        .eq('person_id', person.id).eq('scheduled_day', todayStr)
        .maybeSingle()
      if (dup) { skipped++; return }

      // Skip if person has already acknowledged this session (suppresses reminder)
      const { data: acked } = await db.from('session_acknowledgments').select('id')
        .eq('session_id', sessionId).eq('session_type', sessionType)
        .eq('person_id', person.id)
        .maybeSingle()
      if (acked) { skipped++; return }

      const day   = dayMap.get(dayId)
      const event = evtMap.get(eventId)
      const msg   = `⏰ *Reminder — ${event?.name ?? 'Event'}*\n\n` +
                    `*${label}* starts in 15 minutes.\n\n` +
                    `🕐 ${minsToTime(startMins)}  •  ${day?.name ?? 'Today'}`

      const result = await sendWhatsApp(person.phone_whatsapp, msg, twilioSid, twilioToken, twilioFrom)
      if (result.ok) {
        await db.from('reminder_log').insert([{
          event_id: eventId, session_id: sessionId, session_type: sessionType,
          person_id: person.id, scheduled_day: todayStr,
        }])
        console.log(`✓ ${person.name} ← "${label}"`)
        sent++
      } else {
        errors.push(`${person.name} / "${label}": ${result.error}`)
      }
    }

    // ── ON-TRACK SESSIONS ────────────────────────────────────────────
    const { data: otSessions } = await db
      .from('on_track_sessions')
      .select('id, name, category, day_id, event_id, start_mins, slip_mins, cascade_slip_mins, duration_mins, duration_override')
      .in('day_id', dayIds)

    const otMap = new Map((otSessions ?? []).map(s => [s.id, s]))

    const matchOT = (otSessions ?? []).filter(s => {
      const adj = s.start_mins + (s.slip_mins ?? 0) + (s.cascade_slip_mins ?? 0)
      return adj >= winMin && adj <= winMax
    })

    for (const s of matchOT) {
      const adj   = s.start_mins + (s.slip_mins ?? 0) + (s.cascade_slip_mins ?? 0)
      const label = s.category ? `${s.category} — ${s.name}` : s.name

      const { data: asgn } = await db
        .from('people_on_track')
        .select('people!inner(id, name, phone_whatsapp)')
        .eq('session_id', s.id)

      for (const a of (asgn ?? [])) {
        const p = (a as any).people
        await remind(s.id, 'on_track', s.event_id, p, label, adj, s.day_id)
      }
    }

    // ── ACTIVATION SESSIONS ──────────────────────────────────────────
    const { data: areaSessions } = await db
      .from('area_sessions')
      .select('id, name, area_id, day_id, event_id, dep_type, dep_session_id, dep_offset_mins, start_mins')
      .in('day_id', dayIds)

    const { data: areas } = await db.from('areas').select('id, name').in('event_id', evtIds)
    const areaMap = new Map((areas ?? []).map(a => [a.id, a]))

    function resolveAreaStart(s: any): number | null {
      if (s.dep_type === 'fixed') return s.start_mins
      if (s.dep_type === 'after' && s.dep_session_id) {
        const ot = otMap.get(s.dep_session_id)
        if (!ot) return null
        const otAdj = ot.start_mins + (ot.slip_mins ?? 0) + (ot.cascade_slip_mins ?? 0)
        const otDur = ot.duration_override ?? ot.duration_mins
        return otAdj + otDur + (s.dep_offset_mins ?? 0)
      }
      return null
    }

    const matchArea = (areaSessions ?? []).filter(s => {
      const start = resolveAreaStart(s)
      return start !== null && start >= winMin && start <= winMax
    })

    for (const s of matchArea) {
      const start = resolveAreaStart(s)!
      const area  = areaMap.get(s.area_id)
      const label = area ? `${area.name} — ${s.name}` : s.name

      const { data: asgn } = await db
        .from('people_area_sessions')
        .select('people!inner(id, name, phone_whatsapp)')
        .eq('area_session_id', s.id)

      for (const a of (asgn ?? [])) {
        const p = (a as any).people
        await remind(s.id, 'activation', s.event_id, p, label, start, s.day_id)
      }
    }

    console.log(`send-reminders done — sent:${sent} skipped:${skipped} errors:${errors.length}`)
    return json({ ok: true, sent, skipped, errors })

  } catch (err) {
    console.error('send-reminders fatal:', err)
    return json({ ok: false, error: (err as Error).message }, 500)
  }
})
