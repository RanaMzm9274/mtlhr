import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProfileData {
  name: string;
  email: string;
  phone: string;
  gender: string;
  position: string;
  id_passport: string;
  license: string;
}

export default function EmployeeProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData>({
    name: "", email: "", phone: "", gender: "", position: "", id_passport: "", license: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("employee_profiles").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setProfile({
          name: data.name || "",
          email: data.email || "",
          phone: (data as any).phone || "",
          gender: (data as any).gender || "",
          position: (data as any).position || "",
          id_passport: (data as any).id_passport || "",
          license: (data as any).license || "",
        });
      }
      setLoading(false);
    });
  }, [user]);

  const requiredFields = [profile.name, profile.email, profile.phone, profile.gender, profile.position, profile.id_passport];
  const completionPercent = Math.round((requiredFields.filter(Boolean).length / requiredFields.length) * 100);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("employee_profiles").update({
        name: profile.name,
        phone: profile.phone,
        gender: profile.gender,
        id_passport: profile.id_passport,
        license: profile.license,
        profile_completed: completionPercent === 100,
      } as any).eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin h-8 w-8 text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="text-muted-foreground">Manage your personal information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile Completion</CardTitle>
          <div className="flex items-center gap-3 mt-2">
            <Progress value={completionPercent} className="flex-1" />
            <span className="text-sm font-medium text-muted-foreground">{completionPercent}%</span>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={profile.email} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>ID / Passport Number</Label>
                <Input value={profile.id_passport} onChange={(e) => setProfile({ ...profile, id_passport: e.target.value })} placeholder="Enter ID or passport number" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+44 ..." />
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={profile.gender} onValueChange={(v) => setProfile({ ...profile, gender: v })}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Position</Label>
                <Input value={profile.position} disabled className="bg-muted" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>License / Certification</Label>
                <Input value={profile.license} onChange={(e) => setProfile({ ...profile, license: e.target.value })} placeholder="e.g. UK Driving License, CSCS Card" />
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4" />} Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
