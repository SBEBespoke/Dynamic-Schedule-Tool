// Supabase Edge Function — manage-users
// Admin-only user management operations using the service_role key.
//
// Required Supabase Secrets (auto-available in Edge Functions):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_ANON_KEY
//
// Actions:
//   list   — returns all auth users joined with their user_profiles
//   delete — deletes an auth user by ID (cascades to user_profiles)
//   invite — sends an invite email via Supabase magic link
//
// All requests must be authenticated; caller must have role = 'super_admin'.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')!
    const authHeader   = req.headers.get('Authorization') || ''

    // ── Verify caller is authenticated ────────────────────────────────────────
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller) return json({ error: 'Unauthorized' }, 401)

    // ── Verify caller is super_admin ──────────────────────────────────────────
    const { data: callerProfile } = await callerClient
      .from('user_profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'super_admin') return json({ error: 'Forbidden — super_admin only' }, 403)

    // ── Admin client (service role) ───────────────────────────────────────────
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const body = await req.json()
    const { action, userId, email } = body

    // ── list ──────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const { data: authData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
      if (listError) throw listError

      const { data: profiles } = await admin.from('user_profiles').select('*')
      const profileMap = new Map((profiles || []).map((p: Record<string, unknown>) => [p.id, p]))

      const users = authData.users.map((u) => {
        const profile = (profileMap.get(u.id) || {}) as Record<string, unknown>
        return {
          id:              u.id,
          email:           u.email,
          created_at:      u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          name:            profile.name    || u.email,
          role:            profile.role    || 'team_member',
          phone_whatsapp:  profile.phone_whatsapp || null,
        }
      })

      return json({ ok: true, users })
    }

    // ── delete ────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      if (!userId) throw new Error('userId is required')
      if (userId === caller.id) throw new Error('You cannot delete your own account')

      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) throw error
      return json({ ok: true })
    }

    // ── invite ────────────────────────────────────────────────────────────────
    if (action === 'invite') {
      if (!email) throw new Error('email is required')

      const { error } = await admin.auth.admin.inviteUserByEmail(email.trim().toLowerCase())
      if (error) throw error
      return json({ ok: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (err) {
    console.error('manage-users error:', err)
    return json({ ok: false, error: (err as Error).message }, 500)
  }
})
