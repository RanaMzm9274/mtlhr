import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import EmployeeProfile from "@/pages/employee/EmployeeProfile";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { getProfileCompletion, normalizeProfileRecord } from "@/lib/hrPortal";

export default function EmployeeOnboardingProfile() {
  const { user, companySlug } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [profileDone, setProfileDone] = useState(false);

  const refreshProfileStatus = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("employee_profiles")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const normalized = normalizeProfileRecord(data as any, user);
    setProfileDone(getProfileCompletion(normalized) === 100);
  };

  useEffect(() => {
    void refreshProfileStatus();
    const interval = setInterval(() => void refreshProfileStatus(), 2000);
    return () => clearInterval(interval);
  }, [user]);

  const handleContinue = async () => {
    if (!user || !companySlug) return;
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from("employee_profiles")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      const normalized = normalizeProfileRecord(data as any, user);
      const completed = getProfileCompletion(normalized) === 100;
      if (!completed) {
        toast({
          title: "Complete your profile first",
          description: "Please fill all required profile fields and save changes.",
          variant: "destructive",
        });
        return;
      }

      if (!(data as any)?.profile_completed && (data as any)?.id) {
        await supabase.from("employee_profiles").update({ profile_completed: true } as any).eq("id", (data as any).id);
      }

      navigate(`/${companySlug}/employee/onboarding/documents`);
    } catch (err: any) {
      toast({ title: "Unable to continue", description: err.message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Step 2 of 3: Complete Your Profile</h2>
        <p className="text-sm text-muted-foreground mt-1">
          This step is mandatory before accessing your dashboard.
        </p>
        <div className="mt-3 space-y-2">
          <Progress value={profileDone ? 66 : 33} />
          <p className="text-xs text-muted-foreground">Onboarding progress: {profileDone ? "2/3" : "1/3"}</p>
        </div>
      </div>
      <EmployeeProfile />
      <div className="flex justify-end">
        <Button onClick={() => void handleContinue()} disabled={checking}>
          {checking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Continue to Documents
        </Button>
      </div>
    </div>
  );
}
