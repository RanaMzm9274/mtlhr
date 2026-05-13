import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { buildProfileUpsertPayload, normalizeProfileRecord, saveProfileRecord } from "@/lib/hrPortal";
import { AppLogo } from "@/components/AppLogo";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeout } from "@/lib/async";

type InvitationMode = "auth-invite" | "legacy-token";

interface InvitationState {
  email: string;
  name: string;
  position: string;
  mode: InvitationMode;
  companySlug?: string | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
}

const buildInvitationFromUser = (user: User): InvitationState => {
  const normalized = normalizeProfileRecord({ position: user.user_metadata?.position }, user);
  return {
    email: normalized.email,
    name: normalized.name || normalized.email.split("@")[0],
    position: normalized.position,
    mode: "auth-invite",
  };
};

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [invitation, setInvitation] = useState<InvitationState | null>(null);
  const token = searchParams.get("token");
  const companyInitials = (invitation?.companyName || "Company")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const resolveCompanyById = async (companyId: string) => {
    const { data: companyRow } = await withTimeout(
      supabase
        .from("companies")
        .select("slug,name,logo_url")
        .eq("id", companyId)
        .maybeSingle(),
      SUPABASE_REQUEST_TIMEOUT_MS,
      "Invitation company lookup",
    );

    return {
      companySlug: companyRow?.slug ?? null,
      companyName: companyRow?.name ?? null,
      companyLogoUrl: companyRow?.logo_url ?? null,
    };
  };

  const resolveCompanyByUserId = async (userId: string) => {
    const { data: membershipRow } = await withTimeout(
      supabase
        .from("company_memberships")
        .select("company_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      SUPABASE_REQUEST_TIMEOUT_MS,
      "Membership lookup",
    );

    let companyId = membershipRow?.company_id ?? null;
    if (!companyId) {
      const { data: profileRow } = await withTimeout(
        supabase
          .from("employee_profiles")
          .select("company_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Profile company lookup",
      );
      companyId = profileRow?.company_id ?? null;
    }

    if (!companyId) {
      return {
        companySlug: null,
        companyName: null,
        companyLogoUrl: null,
      };
    }

    return resolveCompanyById(companyId);
  };

  useEffect(() => {
    let mounted = true;

    const setInvitationFromSession = async (user: User | null) => {
      if (!mounted || !user) return false;
      try {
        const companyBrand = await resolveCompanyByUserId(user.id);
        if (!mounted) return false;
        setInvitation({
          ...buildInvitationFromUser(user),
          ...companyBrand,
        });
      } catch {
        if (!mounted) return false;
        setInvitation(buildInvitationFromUser(user));
      }
      setValidating(false);
      return true;
    };

    const validateInvite = async () => {
      if (token) {
        const { data, error } = await withTimeout(
          supabase.functions.invoke("validate-invitation", {
            body: { token },
          }),
          SUPABASE_REQUEST_TIMEOUT_MS,
          "Invitation validation",
        );

        if (!error && data?.valid && mounted) {
          setInvitation({
            email: data.email,
            name: data.name,
            position: data.position,
            mode: "legacy-token",
            companySlug: data.companySlug ?? null,
            companyName: data.companyName ?? null,
            companyLogoUrl: data.companyLogoUrl ?? null,
          });
        }

        if (mounted) setValidating(false);
        return;
      }

      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Invitation session lookup",
      );
      if (await setInvitationFromSession(session?.user ?? null)) return;

      const { data: { user } } = await withTimeout(
        supabase.auth.getUser(),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Invitation user lookup",
      );
      if (await setInvitationFromSession(user ?? null)) return;

      if (mounted) setValidating(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!token && session?.user) {
        void setInvitationFromSession(session.user);
      }
    });

    validateInvite();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;

    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }

    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      if (invitation.mode === "auth-invite") {
        const { data: { user } } = await withTimeout(
          supabase.auth.getUser(),
          SUPABASE_REQUEST_TIMEOUT_MS,
          "Invitation user lookup",
        );
        if (!user) {
          throw new Error("Invitation session not found. Open the latest invitation email again.");
        }

        const { error: updateUserError } = await withTimeout(
          supabase.auth.updateUser({
            password,
            data: {
              name: invitation.name || invitation.email.split("@")[0],
              position: invitation.position || "",
            },
          }),
          SUPABASE_REQUEST_TIMEOUT_MS,
          "Account activation",
        );
        if (updateUserError) throw updateUserError;

        await saveProfileRecord(supabase, {
          ...buildProfileUpsertPayload(user, {
            name: invitation.name || invitation.email.split("@")[0],
            email: user.email ?? invitation.email,
            phone: "",
            gender: "",
            position: invitation.position || "",
            id_passport: "",
            license: "",
            profile_completed: false,
          }),
          status: "active",
        } as any);

        const brand = await resolveCompanyByUserId(user.id);
        toast({ title: "Account activated" });
        navigate(brand.companySlug ? `/${brand.companySlug}/employee/dashboard` : "/login");
        return;
      }

      const { data: signUpData, error: signUpError } = await withTimeout(
        supabase.auth.signUp({
          email: invitation.email,
          password,
          options: {
            data: {
              name: invitation.name || invitation.email.split("@")[0],
              position: invitation.position || "",
            },
          },
        }),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Account creation",
      );
      if (signUpError) throw signUpError;

      const newUser = signUpData.user;
      if (!newUser) {
        throw new Error("User account could not be created.");
      }

      const { error: useInvitationError } = await withTimeout(
        supabase.functions.invoke("use-invitation", {
          body: { token },
        }),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Invitation consumption",
      );
      if (useInvitationError) throw useInvitationError;

      await saveProfileRecord(supabase, {
        ...buildProfileUpsertPayload(newUser, {
          name: invitation.name || invitation.email.split("@")[0],
          email: invitation.email,
          phone: "",
          gender: "",
          position: invitation.position || "",
          id_passport: "",
          license: "",
          profile_completed: false,
        }),
        status: "active",
      } as any);

      const { error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: invitation.email,
          password,
        }),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Auto sign in",
      );
      if (signInError) throw signInError;

      const { data: { user: activatedUser } } = await withTimeout(
        supabase.auth.getUser(),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Activated user lookup",
      );

      const brand = activatedUser ? await resolveCompanyByUserId(activatedUser.id) : null;

      toast({ title: "Account created" });
      navigate(brand?.companySlug ? `/${brand.companySlug}/employee/dashboard` : "/login");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Invalid or expired invitation link.</p>
            <Button variant="link" onClick={() => navigate("/login")} className="mt-4">Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center space-y-4">
          {invitation.companyLogoUrl ? (
            <AppLogo className="items-center" imageClassName="max-w-[280px]" src={invitation.companyLogoUrl} alt={invitation.companyName || "Company"} />
          ) : (
            <div className="mx-auto h-16 w-16 rounded-full border bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold">
              {companyInitials || "C"}
            </div>
          )}
          <div>
            <CardTitle className="text-2xl font-bold">Set Your Password</CardTitle>
            <CardDescription>
              Welcome to the {invitation.companyName || "Company"} HR Portal
              {invitation.name && <span className="block mt-1 font-medium text-foreground">{invitation.name}</span>}
              <span className="block text-xs mt-1">{invitation.email}</span>
              {invitation.position && <span className="block text-xs mt-1">{invitation.position}</span>}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {invitation.mode === "auth-invite" ? "Activate Account" : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
