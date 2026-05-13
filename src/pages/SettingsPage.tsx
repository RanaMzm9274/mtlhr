import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeout } from "@/lib/async";

type CompanyProfile = {
  id: string;
  name: string;
  bio: string | null;
  logo_url: string | null;
  workday_start: string | null;
  workday_end: string | null;
};

export default function SettingsPage() {
  const { user, role, companySlug } = useAuth();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [companyBio, setCompanyBio] = useState("");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [workdayStart, setWorkdayStart] = useState("");
  const [workdayEnd, setWorkdayEnd] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const isCompanyAdminSettings = role === "admin" && !!companySlug;

  useEffect(() => {
    if (!isCompanyAdminSettings || !companySlug) return;
    supabase
      .from("companies")
      .select("id,name,bio,logo_url,workday_start,workday_end")
      .eq("slug", companySlug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return;
        setCompany(data as CompanyProfile);
        setCompanyName(data.name || "");
        setCompanyBio(data.bio || "");
        setCompanyLogoUrl(data.logo_url || "");
        setWorkdayStart(data.workday_start || "");
        setWorkdayEnd(data.workday_end || "");
      });
  }, [companySlug, isCompanyAdminSettings]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await withTimeout(supabase.auth.updateUser({ password: newPassword }), SUPABASE_REQUEST_TIMEOUT_MS, "Password update");
      if (error) throw error;
      toast({ title: "Password updated successfully" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleCompanySave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company?.id) return;

    setSavingCompany(true);
    const { error } = await supabase
      .from("companies")
      .update({
        name: companyName.trim(),
        bio: companyBio.trim() || null,
        logo_url: companyLogoUrl.trim() || null,
        workday_start: workdayStart || null,
        workday_end: workdayEnd || null,
      })
      .eq("id", company.id);
    setSavingCompany(false);

    if (error) {
      toast({ title: "Company update failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Company settings updated" });
  };

  const handleCompanyLogoUpload = async (file?: File) => {
    if (!user || !company?.id || !file) return;
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/companies/${company.id}/logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("profile-images").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("profile-images").getPublicUrl(path);
      setCompanyLogoUrl(data.publicUrl);
      toast({ title: "Logo uploaded", description: "Click Save Company Profile to apply logo." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      {isCompanyAdminSettings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company & Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCompanySave} className="space-y-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Company Bio</Label>
                <Input value={companyBio} onChange={(e) => setCompanyBio(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <Label>Company Logo</Label>
                <div className="flex items-center gap-3">
                  {companyLogoUrl ? (
                    <img src={companyLogoUrl} alt={companyName || "Company"} className="h-12 w-12 rounded-full object-cover border" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold border">
                      {(companyName || "C").trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                  <Input type="file" accept="image/*" disabled={uploadingLogo} onChange={(e) => handleCompanyLogoUpload(e.target.files?.[0])} />
                </div>
                {uploadingLogo && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading logo...</p>}
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Workday Start</Label>
                  <Input type="time" value={workdayStart} onChange={(e) => setWorkdayStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Workday End</Label>
                  <Input type="time" value={workdayEnd} onChange={(e) => setWorkdayEnd(e.target.value)} />
                </div>
              </div>
              <Button type="submit" disabled={savingCompany}>
                {savingCompany ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
                Save Company Profile
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" required minLength={8} />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" required />
            </div>
            <Button type="submit" disabled={changingPassword}>
              {changingPassword ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{user?.email}</span></div>
          <Separator />
          <div className="flex justify-between"><span className="text-muted-foreground">User ID</span><span className="font-mono text-xs">{user?.id?.slice(0, 8)}...</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
