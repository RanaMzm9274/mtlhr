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
    name: "", email: "", phone: "", gender: "", position: "", address: "", website: "", license: "", avatar_url: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingExtraDoc, setUploadingExtraDoc] = useState(false);

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
          address: ((data as any[])?.[0]?.address as string | undefined) ?? "",
          website: ((data as any[])?.[0]?.website as string | undefined) ?? "",
          license: normalized.license,
          avatar_url: normalized.avatar_url || "",
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
          id_passport: "",
          license: profile.license,
          avatar_url: profile.avatar_url || null,
          profile_completed: false,
        }),
        address: profile.address || null,
        website: profile.website || null,
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
        address: ((savedRow as any)?.address as string | undefined) ?? "",
        website: ((savedRow as any)?.website as string | undefined) ?? "",
        license: normalized.license,
        avatar_url: normalized.avatar_url || "",
      });
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file?: File) => {
    if (!user || !file) return;
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatars/admin-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("profile-images").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("profile-images").getPublicUrl(path);
      setProfile((prev) => ({ ...prev, avatar_url: data.publicUrl }));
      toast({ title: "Image uploaded", description: "Click Save Changes to apply profile image." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAdditionalDocumentUpload = async (file?: File) => {
    if (!user || !file) return;
    setUploadingExtraDoc(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${user.id}/profile-docs/license-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("documents").insert({
        user_id: user.id,
        file_url: path,
        file_name: file.name,
        file_type: ext,
        category: "certificate",
        uploaded_at: new Date().toISOString(),
      } as any);
      if (insertError) throw insertError;

      toast({ title: "Document uploaded", description: "Additional document saved successfully." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingExtraDoc(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin h-8 w-8 text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="text-muted-foreground">Update your personal information</p>
      </div>

      <Card className="overflow-hidden rounded-3xl">
        <CardContent className="pt-8 pb-8">
          <div className="mb-6 flex flex-col items-center gap-3">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="Profile" className="h-20 w-20 rounded-full object-cover border" />
            ) : (
              <div className="h-20 w-20 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold border">
                {(profile.name || "A").trim().charAt(0).toUpperCase()}
              </div>
            )}
            <Button variant="outline" className="rounded-xl">Edit Profile</Button>
          </div>
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
                <Select value={profile.position} onValueChange={(v) => setProfile({ ...profile, position: v })}>
                  <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Director">Director</SelectItem>
                    <SelectItem value="Business Manager">Business Manager</SelectItem>
                    <SelectItem value="Project Manager">Project Manager</SelectItem>
                    <SelectItem value="Team Lead">Team Lead</SelectItem>
                    <SelectItem value="Hiring Manager">Hiring Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} placeholder="Enter address" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Website</Label>
                <Input value={profile.website} onChange={(e) => setProfile({ ...profile, website: e.target.value })} placeholder="https://example.com" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>License / Certification</Label>
                <Input value={profile.license} onChange={(e) => setProfile({ ...profile, license: e.target.value })} placeholder="e.g. UK Driving License, CSCS Card" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Additional Document</Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  disabled={uploadingExtraDoc}
                  onChange={(e) => handleAdditionalDocumentUpload(e.target.files?.[0])}
                />
                {uploadingExtraDoc && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Uploading document...
                  </p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Profile Picture</Label>
                <div className="flex items-center gap-3">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="Profile" className="h-12 w-12 rounded-full object-cover border" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold border">
                      {(profile.name || "A").trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                  <Input type="file" accept="image/*" disabled={uploadingImage} onChange={(e) => handleAvatarUpload(e.target.files?.[0])} />
                </div>
                {uploadingImage && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading image...</p>}
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
