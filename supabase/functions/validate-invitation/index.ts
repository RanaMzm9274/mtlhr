import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.25.76'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TokenSchema = z.object({
  token: z.string().uuid(),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const parsed = TokenSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { data, error } = await supabase
      .from('invitations')
      .select('id, email, name, position, expires_at, used, company_id')
      .eq('token', parsed.data.token)
      .eq('used', false)
      .maybeSingle()

    if (error || !data) {
      return new Response(
        JSON.stringify({ valid: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (new Date(data.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Invitation expired' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let companySlug: string | null = null
    let companyName: string | null = null
    let companyLogoUrl: string | null = null
    if (data.company_id) {
      const { data: companyData } = await supabase
        .from('companies')
        .select('slug,name,logo_url')
        .eq('id', data.company_id)
        .maybeSingle()
      companySlug = companyData?.slug ?? null
      companyName = companyData?.name ?? null
      companyLogoUrl = companyData?.logo_url ?? null
    }

    return new Response(
      JSON.stringify({
        valid: true,
        email: data.email,
        name: data.name,
        position: data.position,
        companySlug,
        companyName,
        companyLogoUrl,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch {
    return new Response(
      JSON.stringify({ valid: false, error: 'Server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
