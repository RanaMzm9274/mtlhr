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

type WorkspaceOption = { id: string; name: string; slug: string; status: string };
type UserCandidate = { user_id: string; name: string; email: string };
type CompanyHoliday = { id: string; name: string; date_from: string; date_to: string };

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
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [userCandidates, setUserCandidates] = useState<UserCandidate[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [addingUser, setAddingUser] = useState(false);
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDateFrom, setHolidayDateFrom] = useState("");
  const [holidayDateTo, setHolidayDateTo] = useState("");
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [deletingHolidayId, setDeletingHolidayId] = useState<string | null>(null);
  const todayDate = new Date().toISOString().slice(0, 10);

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

  useEffect(() => {
    if (!isCompanyAdminSettings || !company?.id) return;
    supabase
      .from("company_holidays")
      .select("id,name,date_from,date_to")
      .eq("company_id", company.id)
      .order("date_from", { ascending: true })
      .then(({ data }) => {
        setHolidays((data as CompanyHoliday[]) ?? []);
      });
  }, [isCompanyAdminSettings, company?.id]);

  useEffect(() => {
    if (!isCompanyAdminSettings || !user) return;
    const loadWorkspaceData = async () => {
      const [{ data: memberships }, { data: candidates }] = await Promise.all([
        supabase
          .from("company_memberships")
          .select("company_id,companies!inner(id,name,slug,status)")
          .eq("user_id", user.id),
        supabase
          .from("employee_profiles")
          .select("user_id,name,email")
          .neq("user_id", user.id)
          .order("name", { ascending: true }),
      ]);

      const mappedWorkspaces: WorkspaceOption[] = ((memberships as any[]) ?? []).map((row) => ({
        id: row.companies.id,
        name: row.companies.name,
        slug: row.companies.slug,
        status: row.companies.status,
      }));
      setWorkspaces(mappedWorkspaces);
      if (!selectedWorkspaceId && mappedWorkspaces.length > 0) setSelectedWorkspaceId(mappedWorkspaces[0].id);

      setUserCandidates(((candidates as UserCandidate[]) ?? []).filter((c) => !!c.user_id));
    };
    void loadWorkspaceData();
  }, [isCompanyAdminSettings, user?.id, selectedWorkspaceId]);

  const toSlug = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

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

  const handleRemoveCompanyLogo = async () => {
    if (!company?.id) return;
    setSavingCompany(true);
    const { error } = await supabase.from("companies").update({ logo_url: null }).eq("id", company.id);
    setSavingCompany(false);
    if (error) {
      toast({ title: "Remove logo failed", description: error.message, variant: "destructive" });
      return;
    }
    setCompanyLogoUrl("");
    toast({ title: "Logo removed" });
  };

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const name = workspaceName.trim();
    const slug = (workspaceSlug.trim() || toSlug(name)).toLowerCase();
    if (!name || !slug) {
      toast({ title: "Workspace name and slug are required", variant: "destructive" });
      return;
    }

    setCreatingWorkspace(true);
    try {
      const now = new Date().toISOString();
      const { data: companyRow, error: companyError } = await supabase
        .from("companies")
        .insert({ name, slug, status: "approved", created_by: user.id, approved_at: now, approved_by: user.id })
        .select("id,name,slug,status")
        .single();
      if (companyError || !companyRow) throw new Error(companyError?.message || "Workspace creation failed.");

      const { error: membershipError } = await supabase.from("company_memberships").insert({
        company_id: companyRow.id,
        user_id: user.id,
        status: "approved",
        approved_at: now,
        approved_by: user.id,
      });
      if (membershipError) throw new Error(membershipError.message);

      setWorkspaces((prev) => [companyRow as WorkspaceOption, ...prev]);
      setSelectedWorkspaceId(companyRow.id);
      setWorkspaceName("");
      setWorkspaceSlug("");
      toast({ title: "Workspace created" });
    } catch (err: any) {
      toast({ title: "Unable to create workspace", description: err.message, variant: "destructive" });
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const addUserToWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspaceId || !selectedUserId || !user) return;
    setAddingUser(true);
    try {
      const now = new Date().toISOString();
      const { error: membershipError } = await supabase.from("company_memberships").upsert(
        {
          company_id: selectedWorkspaceId,
          user_id: selectedUserId,
          status: "approved",
          approved_at: now,
          approved_by: user.id,
        },
        { onConflict: "user_id" },
      );
      if (membershipError) throw new Error(membershipError.message);

      const { error: profileError } = await supabase.from("employee_profiles").update({ company_id: selectedWorkspaceId }).eq("user_id", selectedUserId);
      if (profileError) throw new Error(profileError.message);

      setSelectedUserId("");
      toast({ title: "User added to workspace" });
    } catch (err: any) {
      toast({ title: "Unable to add user", description: err.message, variant: "destructive" });
    } finally {
      setAddingUser(false);
    }
  };

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company?.id || !holidayName.trim() || !holidayDateFrom || !holidayDateTo) return;
    if (holidayDateFrom < todayDate || holidayDateTo < todayDate) {
      toast({ title: "Invalid date", description: "Past dates are not allowed for holidays.", variant: "destructive" });
      return;
    }
    if (holidayDateFrom > holidayDateTo) {
      toast({ title: "Invalid range", description: "Date From must be earlier than or equal to Date To.", variant: "destructive" });
      return;
    }
    setSavingHoliday(true);
    const { data, error } = await supabase
      .from("company_holidays")
      .insert({
        company_id: company.id,
        name: holidayName.trim(),
        date_from: holidayDateFrom,
        date_to: holidayDateTo,
        holiday_date: holidayDateFrom as any,
        created_by: user?.id ?? null,
      } as any)
      .select("id,name,date_from,date_to")
      .single();
    setSavingHoliday(false);
    if (error) {
      toast({ title: "Add holiday failed", description: error.message, variant: "destructive" });
      return;
    }
    setHolidays((prev) => [...prev, data as CompanyHoliday].sort((a, b) => a.date_from.localeCompare(b.date_from)));
    setHolidayName("");
    setHolidayDateFrom("");
    setHolidayDateTo("");
    toast({ title: "Holiday added" });
  };

  const removeHoliday = async (holidayId: string) => {
    setDeletingHolidayId(holidayId);
    const { error } = await supabase.from("company_holidays").delete().eq("id", holidayId);
    setDeletingHolidayId(null);
    if (error) {
      toast({ title: "Delete holiday failed", description: error.message, variant: "destructive" });
      return;
    }
    setHolidays((prev) => prev.filter((holiday) => holiday.id !== holidayId));
    toast({ title: "Holiday removed" });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      {isCompanyAdminSettings && (
        <>
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
                  {companyLogoUrl ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleRemoveCompanyLogo()} disabled={savingCompany || uploadingLogo}>
                      Remove Logo
                    </Button>
                  ) : null}
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workspace Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={createWorkspace} className="space-y-3">
                <p className="text-sm font-medium">Create Workspace</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Workspace Name</Label>
                    <Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="e.g. Acme Operations" />
                  </div>
                  <div className="space-y-2">
                    <Label>Workspace Slug</Label>
                    <Input value={workspaceSlug} onChange={(e) => setWorkspaceSlug(e.target.value)} placeholder="e.g. acme-operations" />
                  </div>
                </div>
                <Button type="submit" disabled={creatingWorkspace}>
                  {creatingWorkspace ? <Loader2 className="animate-spin mr-2" /> : null}
                  Create Workspace
                </Button>
              </form>

              <Separator />

              <form onSubmit={addUserToWorkspace} className="space-y-3">
                <p className="text-sm font-medium">Add User To Workspace</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Select Workspace</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={selectedWorkspaceId}
                      onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                    >
                      <option value="">Select workspace</option>
                      {workspaces.map((workspace) => (
                        <option key={workspace.id} value={workspace.id}>
                          {workspace.name} ({workspace.slug}) - {workspace.status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Select User</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                    >
                      <option value="">Select user</option>
                      {userCandidates.map((candidate) => (
                        <option key={candidate.user_id} value={candidate.user_id}>
                          {candidate.name || "User"} ({candidate.email || "No email"})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Adding a user to another workspace updates their active company membership.</p>
                <Button type="submit" disabled={addingUser || !selectedWorkspaceId || !selectedUserId}>
                  {addingUser ? <Loader2 className="animate-spin mr-2" /> : null}
                  Add User
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company Holidays</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={addHoliday} className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
                <Input value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="Holiday name" required />
                <Input type="date" min={todayDate} value={holidayDateFrom} onChange={(e) => setHolidayDateFrom(e.target.value)} required />
                <Input type="date" min={todayDate} value={holidayDateTo} onChange={(e) => setHolidayDateTo(e.target.value)} required />
                <Button type="submit" disabled={savingHoliday}>
                  {savingHoliday ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                  Add Holiday
                </Button>
              </form>
              <div className="space-y-2">
                {holidays.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No holidays added yet.</p>
                ) : (
                  holidays.map((holiday) => (
                    <div key={holiday.id} className="flex items-center justify-between rounded-md border p-2">
                      <div>
                        <p className="text-sm font-medium">{holiday.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(`${holiday.date_from}T00:00:00`).toLocaleDateString()} - {new Date(`${holiday.date_to}T00:00:00`).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void removeHoliday(holiday.id)}
                        disabled={deletingHolidayId === holiday.id}
                      >
                        {deletingHolidayId === holiday.id ? "Removing..." : "Remove"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </>
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
