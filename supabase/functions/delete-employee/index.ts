import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify the caller is an admin
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller } } = await userClient.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: roleRows, error: roleError } = await adminClient.from('user_roles').select('role').eq('user_id', caller.id)
    if (roleError) {
      return new Response(JSON.stringify({ error: roleError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (!(roleRows ?? []).some((role) => role.role === 'admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const payload = await req.json()
    const user_id = typeof payload?.user_id === 'string' && payload.user_id.trim() ? payload.user_id.trim() : null
    const profile_id = typeof payload?.profile_id === 'string' && payload.profile_id.trim() ? payload.profile_id.trim() : null
    const email = typeof payload?.email === 'string' && payload.email.trim() ? payload.email.trim().toLowerCase() : null
    if (!user_id && !profile_id && !email) {
      return new Response(JSON.stringify({ error: 'user_id, profile_id or email required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Prevent deleting yourself
    if (user_id && user_id === caller.id) {
      return new Response(JSON.stringify({ error: 'Cannot delete yourself' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Full account delete path when we have auth user id.
    if (user_id) {
      const { error: docsError } = await adminClient.from('documents').delete().eq('user_id', user_id)
      if (docsError) {
        return new Response(JSON.stringify({ error: `Documents delete failed: ${docsError.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { error: leaveError } = await adminClient.from('leave_requests').delete().eq('user_id', user_id)
      if (leaveError) {
        return new Response(JSON.stringify({ error: `Leave requests delete failed: ${leaveError.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { error: profileError } = await adminClient.from('employee_profiles').delete().eq('user_id', user_id)
      if (profileError) {
        return new Response(JSON.stringify({ error: `Profile delete failed: ${profileError.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { error: roleDeleteError } = await adminClient.from('user_roles').delete().eq('user_id', user_id)
      if (roleDeleteError) {
        return new Response(JSON.stringify({ error: `Role delete failed: ${roleDeleteError.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { error: authError } = await adminClient.auth.admin.deleteUser(user_id)
      if (authError) {
        console.error('Auth delete error:', authError)
        return new Response(JSON.stringify({ error: authError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    } else {
      // Invited profile cleanup path when there is no auth user id.
      if (profile_id) {
        const { error: profileDeleteError } = await adminClient.from('employee_profiles').delete().eq('id', profile_id)
        if (profileDeleteError) {
          return new Response(JSON.stringify({ error: `Profile delete failed: ${profileDeleteError.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
      } else if (email) {
        const { error: profileDeleteError } = await adminClient.from('employee_profiles').delete().ilike('email', email)
        if (profileDeleteError) {
          return new Response(JSON.stringify({ error: `Profile delete failed: ${profileDeleteError.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error', fallback: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
