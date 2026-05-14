import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const InviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  position: z.string().min(1),
  company_id: z.string().uuid().optional(),
  redirectTo: z.string().url().optional(),
});

function getAppOrigin(reqUrl: string): string {
  const configuredOrigin = Deno.env.get("APP_ORIGIN")?.trim();
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      // Ignore invalid APP_ORIGIN and fall back.
    }
  }

  const requestOrigin = new URL(reqUrl).origin;
  const fromRequest = requestOrigin.replace("/functions/v1", "");
  return fromRequest;
}

function buildInviteRedirectTo(reqUrl: string, inputRedirectTo?: string): string {
  const appOrigin = getAppOrigin(reqUrl);
  const fallback = `${appOrigin}/set-password`;

  if (!inputRedirectTo) return fallback;

  try {
    const parsed = new URL(inputRedirectTo);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    if (normalizedPath.endsWith("/set-password")) {
      return `${parsed.origin}/set-password`;
    }
    return `${parsed.origin}/set-password`;
  } catch {
    return fallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    const body = await req.json();
    const parsed = InviteSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid invitation payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: authHeader ? { Authorization: authHeader } : {} } });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized request." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = authData.user.id;
    const [{ data: roleRows, error: roleLookupError }, { data: membershipRow, error: membershipError }] = await Promise.all([
      adminClient.from("user_roles").select("role").eq("user_id", userId),
      adminClient
        .from("company_memberships")
        .select("company_id,status,companies(status,name,slug,logo_url)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (roleLookupError || membershipError) {
      return new Response(JSON.stringify({ error: roleLookupError?.message ?? membershipError?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const roles = roleRows ?? [];
    const isSuperAdmin = roles.some((role) => role.role === "super_admin");
    const isAdmin = roles.some((role) => role.role === "admin");

    let companyId = membershipRow?.company_id ?? null;
    let membershipStatus = membershipRow?.status ?? null;
    let companyStatus = (membershipRow as { companies?: { status?: string } } | null)?.companies?.status ?? null;
    let companyName = (membershipRow as { companies?: { name?: string } } | null)?.companies?.name ?? null;
    let companySlug = (membershipRow as { companies?: { slug?: string } } | null)?.companies?.slug ?? null;
    let companyLogoUrl = (membershipRow as { companies?: { logo_url?: string } } | null)?.companies?.logo_url ?? null;

    // Fallback for older data where membership row might be missing.
    if (!companyId) {
      const { data: profileRow } = await adminClient
        .from("employee_profiles")
        .select("company_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (profileRow?.company_id) {
        companyId = profileRow.company_id;
        const { data: companyRow } = await adminClient.from("companies").select("status,name,slug,logo_url").eq("id", companyId).maybeSingle();
        companyStatus = companyRow?.status ?? companyStatus;
        companyName = companyRow?.name ?? companyName;
        companySlug = companyRow?.slug ?? companySlug;
        companyLogoUrl = companyRow?.logo_url ?? companyLogoUrl;
      }
    }

    if (isSuperAdmin && parsed.data.company_id) {
      companyId = parsed.data.company_id;
      const { data: companyRow } = await adminClient.from("companies").select("status,name,slug,logo_url").eq("id", companyId).maybeSingle();
      companyStatus = companyRow?.status ?? companyStatus;
      companyName = companyRow?.name ?? companyName;
      companySlug = companyRow?.slug ?? companySlug;
      companyLogoUrl = companyRow?.logo_url ?? companyLogoUrl;
    }

    const adminAllowed = isAdmin && !!companyId && (membershipStatus === "approved" || companyStatus === "approved");
    if (!isSuperAdmin && !adminAllowed) {
      return new Response(JSON.stringify({ error: "Only approved company admins can invite employees. Ensure your company is approved and linked." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (isSuperAdmin && !companyId) {
      return new Response(JSON.stringify({ error: "company_id is required for super admin invitations." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const appOrigin = getAppOrigin(req.url);

    const inviterName =
      (authData.user.user_metadata?.name as string | undefined) ??
      (authData.user.user_metadata?.full_name as string | undefined) ??
      authData.user.email ??
      "Company Admin";
    const effectiveCompanyName = companyName ?? "Company";
    const portalUrl = companySlug ? `${appOrigin}/${companySlug}/login` : `${appOrigin}/login`;
    const redirectTo = buildInviteRedirectTo(req.url, parsed.data.redirectTo);
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(parsed.data.email, {
      redirectTo,
      data: {
        name: parsed.data.name,
        position: parsed.data.position,
        company_name: effectiveCompanyName,
        company_slug: companySlug,
        company_logo_url: companyLogoUrl,
        portal_url: portalUrl,
        inviter_name: inviterName,
      },
    });

    if (inviteError || !inviteData.user) {
      return new Response(JSON.stringify({ error: inviteError?.message ?? "Invitation could not be created." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const invitedUser = inviteData.user;

    // Enforce invited account access as employee so post-invite login routes to employee portal.
    await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", invitedUser.id)
      .in("role", ["admin", "super_admin"]);

    const { error: userRoleError } = await adminClient.from("user_roles").upsert({ user_id: invitedUser.id, role: "employee" }, { onConflict: "user_id,role" });
    if (userRoleError) {
      return new Response(
        JSON.stringify({ error: userRoleError.message || "Failed to assign employee role." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (companyId) {
      await adminClient
        .from("company_memberships")
        .upsert({ company_id: companyId, user_id: invitedUser.id, status: "approved", approved_at: new Date().toISOString() }, { onConflict: "user_id" });
    }

    const profilePayload = {
      user_id: invitedUser.id,
      name: parsed.data.name,
      email: parsed.data.email,
      position: parsed.data.position,
      status: "invited",
      company_id: companyId,
    };

    await adminClient.from("employee_profiles").upsert(profilePayload, { onConflict: "user_id" });

    if (companyId) {
      await adminClient.from("invitations").insert({
        token: crypto.randomUUID(),
        email: parsed.data.email,
        name: parsed.data.name,
        position: parsed.data.position,
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        company_id: companyId,
      });
    }

    return new Response(JSON.stringify({ success: true, email: parsed.data.email }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
