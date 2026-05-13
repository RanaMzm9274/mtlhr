import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user: caller } } = await userClient.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const [{ data: roleRows }, { data: membership }] = await Promise.all([
      adminClient.from('user_roles').select('role').eq('user_id', caller.id),
      adminClient.from('company_memberships').select('company_id,status').eq('user_id', caller.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    const isSuperAdmin = (roleRows ?? []).some((role) => role.role === 'super_admin')
    const isAdmin = (roleRows ?? []).some((role) => role.role === 'admin')
    if (!isSuperAdmin && (!isAdmin || membership?.status !== 'approved')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const payload = await req.json()
    const user_id = typeof payload?.user_id === 'string' && payload.user_id.trim() ? payload.user_id.trim() : null
    const profile_id = typeof payload?.profile_id === 'string' && payload.profile_id.trim() ? payload.profile_id.trim() : null
    const email = typeof payload?.email === 'string' && payload.email.trim() ? payload.email.trim().toLowerCase() : null
    if (!user_id && !profile_id && !email) {
      return new Response(JSON.stringify({ error: 'user_id, profile_id or email required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (user_id && user_id === caller.id) {
      return new Response(JSON.stringify({ error: 'Cannot delete yourself' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let targetCompanyId: string | null = null
    if (user_id) {
      const { data: targetMembership } = await adminClient
        .from('company_memberships')
        .select('company_id')
        .eq('user_id', user_id)
        .maybeSingle()
      targetCompanyId = targetMembership?.company_id ?? null
    }

    if (!isSuperAdmin && targetCompanyId && targetCompanyId !== membership?.company_id) {
      return new Response(JSON.stringify({ error: 'You can only delete users in your company.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (user_id) {
      await adminClient.from('documents').delete().eq('user_id', user_id)
      await adminClient.from('leave_requests').delete().eq('user_id', user_id)
      await adminClient.from('employee_profiles').delete().eq('user_id', user_id)
      await adminClient.from('company_memberships').delete().eq('user_id', user_id)
      await adminClient.from('user_roles').delete().eq('user_id', user_id)
      const { error: authError } = await adminClient.auth.admin.deleteUser(user_id)
      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    } else if (profile_id) {
      await adminClient.from('employee_profiles').delete().eq('id', profile_id)
    } else if (email) {
      await adminClient.from('employee_profiles').delete().ilike('email', email)
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error', fallback: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
