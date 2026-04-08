import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { removeUndefined } from "@/lib/utils";
import { buildProfileUpsertPayload, normalizeProfileRecord, saveProfileRecord } from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeoutFallback } from "@/lib/async";

export default function AdminProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState({
    name: "", email: "", phone: "", gender: "", position: "", id_passport: "", license: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await withTimeoutFallback(
          supabase
            .from("employee_profiles")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1),
          { data: [], error: null } as any,
          SUPABASE_REQUEST_TIMEOUT_MS,
        );
        if (error) console.error("Failed to fetch admin profile:", error);
        const normalized = normalizeProfileRecord((data as any[])?.[0], user);
        setProfile({
          name: normalized.name,
          email: normalized.email,
          phone: normalized.phone,
          gender: normalized.gender,
          position: normalized.position,
          id_passport: normalized.id_passport,
          license: normalized.license,
        });
      } catch (err) {
        console.error("Error fetching admin profile:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const payload = removeUndefined({
        ...buildProfileUpsertPayload(user, {
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          gender: profile.gender,
          position: profile.position,
          id_passport: profile.id_passport,
          license: profile.license,
          profile_completed: false,
        }),
        status: "active",
      } as any);
      const savedRow = await saveProfileRecord(supabase, payload as any);
      const normalized = normalizeProfileRecord(savedRow as any, user);
      setProfile({
        name: normalized.name,
        email: normalized.email,
        phone: normalized.phone,
        gender: normalized.gender,
        position: normalized.position,
        id_passport: normalized.id_passport,
        license: normalized.license,
      });
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
        <p className="text-muted-foreground">Update your personal information</p>
      </div>

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
                <Input value={profile.position} onChange={(e) => setProfile({ ...profile, position: e.target.value })} placeholder="e.g. Managing Director" />
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
