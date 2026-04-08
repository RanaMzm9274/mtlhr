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
  redirectTo: z.string().url().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    const body = await req.json();
    const parsed = InviteSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid invitation payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized request." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: roleRows, error: roleLookupError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id);

    if (roleLookupError) {
      return new Response(
        JSON.stringify({ error: roleLookupError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isAdmin = (roleRows ?? []).some((role) => role.role === "admin");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Only admins can invite employees." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const redirectTo = parsed.data.redirectTo ?? `${new URL(req.url).origin.replace("/functions/v1", "")}/set-password`;
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      parsed.data.email,
      {
        redirectTo,
        data: {
          name: parsed.data.name,
          position: parsed.data.position,
        },
      },
    );

    if (inviteError || !inviteData.user) {
      return new Response(
        JSON.stringify({ error: inviteError?.message ?? "Invitation could not be created." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const invitedUser = inviteData.user;
    const { data: existingProfiles, error: existingProfileError } = await adminClient
      .from("employee_profiles")
      .select("id, status")
      .eq("user_id", invitedUser.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingProfileError) {
      return new Response(
        JSON.stringify({ error: existingProfileError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const existingProfile = existingProfiles?.[0];
    const nextStatus = existingProfile?.status === "active" ? "active" : "invited";

    const { data: existingRoles, error: existingRolesError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", invitedUser.id);

    if (existingRolesError) {
      return new Response(
        JSON.stringify({ error: existingRolesError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let roleError: { message: string } | null = null;
    if (!(existingRoles ?? []).some((role) => role.role === "employee")) {
      const roleInsertResult = await adminClient
        .from("user_roles")
        .insert({ user_id: invitedUser.id, role: "employee" });
      roleError = roleInsertResult.error;
    }

    if (roleError) {
      return new Response(
        JSON.stringify({ error: roleError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const profilePayload = {
      name: parsed.data.name,
      email: parsed.data.email,
      position: parsed.data.position,
      status: nextStatus,
    };

    const profileResult = existingProfile?.id
      ? await adminClient
        .from("employee_profiles")
        .update(profilePayload)
        .eq("id", existingProfile.id)
      : await adminClient
        .from("employee_profiles")
        .insert({
          user_id: invitedUser.id,
          ...profilePayload,
        });

    const profileError = profileResult.error;

    if (profileError) {
      return new Response(
        JSON.stringify({ error: profileError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, email: parsed.data.email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
