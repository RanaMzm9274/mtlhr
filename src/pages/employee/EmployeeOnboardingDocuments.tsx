import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import EmployeeDocuments from "@/pages/employee/EmployeeDocuments";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

export default function EmployeeOnboardingDocuments() {
  const { user, companySlug } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  const requiredCategories = ["id_proof", "cv", "certificate"];
  const uploadedRequiredCount = useMemo(
    () => requiredCategories.filter((category) => categories.includes(category)).length,
    [categories],
  );
  const progressValue = Math.round(66 + ((uploadedRequiredCount / requiredCategories.length) * 34));

  const refreshCategories = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("documents")
      .select("category")
      .eq("user_id", user.id);
    const unique = Array.from(new Set(((data as Array<{ category?: string }>) ?? []).map((row) => row.category).filter(Boolean) as string[]));
    setCategories(unique);
  };

  useEffect(() => {
    void refreshCategories();
  }, [user]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshCategories();
    }, 2000);
    return () => clearInterval(interval);
  }, [user]);

  const handleFinish = async () => {
    if (!user || !companySlug) return;
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from("documents")
        .select("category")
        .eq("user_id", user.id);

      if (error) throw error;
      const uploaded = new Set(((data as Array<{ category?: string }>) ?? []).map((row) => row.category).filter(Boolean) as string[]);
      const missingRequired = requiredCategories.filter((category) => !uploaded.has(category));
      if (missingRequired.length > 0) {
        toast({
          title: "Upload required documents",
          description: "Passport, Share Code, and Work Permit are mandatory. 'Other' is optional.",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Onboarding completed" });
      navigate(`/${companySlug}/employee/dashboard`, { replace: true });
    } catch (err: any) {
      toast({ title: "Unable to finish onboarding", description: err.message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Step 3 of 3: Upload Documents</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Mandatory categories: Passport, Share Code, Work Permit. Other is optional.
        </p>
        <div className="mt-3 space-y-2">
          <Progress value={progressValue} />
          <p className="text-xs text-muted-foreground">
            Onboarding progress: {uploadedRequiredCount === 3 ? "3/3" : "2/3"} | Required uploaded: {uploadedRequiredCount}/3
          </p>
        </div>
      </div>
      <EmployeeDocuments />
      <div className="flex justify-end">
        <Button onClick={() => void handleFinish()} disabled={checking || uploadedRequiredCount < 3}>
          {checking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Finish Onboarding
        </Button>
      </div>
    </div>
  );
}
