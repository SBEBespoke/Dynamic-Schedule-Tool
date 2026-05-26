// Supabase Edge Function — send-whatsapp
// Sends WhatsApp messages via Twilio to a list of recipients.
//
// Required Supabase Secrets (set in Dashboard → Project Settings → Edge Functions):
//   TWILIO_ACCOUNT_SID   — e.g. ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   TWILIO_AUTH_TOKEN    — your Twilio Auth Token
//   TWILIO_WHATSAPP_FROM — sender number, e.g. whatsapp:+14155238886
//
// Request body: { recipients: [{ name: string, phone: string }], message: string }
// `phone` must include country code, e.g. "+61412345678"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { recipients, message } = await req.json()

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no recipients' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM')

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio credentials not configured in Supabase Secrets')
    }

    const basicAuth = btoa(`${accountSid}:${authToken}`)
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

    const results = []

    for (const { name, phone } of recipients) {
      // Normalise phone: strip spaces, ensure it starts with +
      const normPhone = phone.replace(/\s+/g, '')
      const toNumber  = normPhone.startsWith('whatsapp:') ? normPhone : `whatsapp:${normPhone}`

      const body = new URLSearchParams({
        From: fromNumber,
        To:   toNumber,
        Body: message,
      })

      const resp = await fetch(twilioUrl, {
        method:  'POST',
        headers: {
          Authorization:  `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })

      const result = await resp.json()
      results.push({
        name,
        phone:  normPhone,
        sid:    result.sid    ?? null,
        status: result.status ?? null,
        error:  result.message ?? null,   // Twilio error message if any
      })
    }

    const errors = results.filter(r => r.error)
    console.log(`send-whatsapp: sent ${results.length - errors.length}/${results.length} ok`, errors.length ? errors : '')

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-whatsapp error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
