import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { removeUndefined } from "@/lib/utils";
import {
  buildProfileUpsertPayload,
  getProfileCompletion,
  normalizeProfileRecord,
  saveProfileRecord,
} from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeoutFallback } from "@/lib/async";

interface ProfileData {
  avatar_url: string;
  first_name: string;
  surname: string;
  email: string;
  date_of_birth: string;
  phone: string;
  address: string;
  gender: string;
  position: string;
  id_passport: string;
  employment_type: "full_time" | "part_time";
  working_hours: string;
}

export default function EmployeeProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData>({
    avatar_url: "",
    first_name: "",
    surname: "",
    email: "",
    date_of_birth: "",
    phone: "",
    address: "",
    gender: "",
    position: "",
    id_passport: "",
    employment_type: "full_time",
    working_hours: "8",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const minAllowedDob = (() => {
    const today = new Date();
    today.setFullYear(today.getFullYear() - 18);
    return today.toISOString().slice(0, 10);
  })();

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
        if (error) {
          console.error("Failed to fetch profile:", error);
        }
        const normalized = normalizeProfileRecord((data as any[])?.[0], user);
        const [first_name, ...surnameParts] = normalized.name
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        setProfile({
          first_name: first_name || "",
          surname: surnameParts.join(" "),
          email: normalized.email,
          date_of_birth:
            ((data as any[])?.[0]?.date_of_birth as string | undefined) ?? "",
          phone: normalized.phone,
          address: ((data as any[])?.[0]?.address as string | undefined) ?? "",
          gender: normalized.gender,
          position: normalized.position,
          id_passport: normalized.id_passport,
          avatar_url: normalized.avatar_url || "",
          employment_type:
            normalized.employment_type === "part_time"
              ? "part_time"
              : "full_time",
          working_hours: normalized.working_hours
            ? String(normalized.working_hours)
            : "9",
        });
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const completionPercent = getProfileCompletion({
    name: `${profile.first_name} ${profile.surname}`.trim(),
    email: profile.email,
    phone: profile.phone,
    gender: profile.gender,
    position: profile.position,
    id_passport: profile.id_passport,
  } as any);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (profile.date_of_birth) {
      const dob = new Date(`${profile.date_of_birth}T00:00:00`);
      const now = new Date();
      let age = now.getFullYear() - dob.getFullYear();
      const monthDiff = now.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
        age--;
      }
      if (Number.isNaN(dob.getTime()) || age < 18) {
        toast({
          title: "Invalid date of birth",
          description: "Employee must be at least 18 years old.",
          variant: "destructive",
        });
        return;
      }
    }
    setSaving(true);
    try {
      const fullName = `${profile.first_name} ${profile.surname}`.trim();
      const payload = removeUndefined({
        ...buildProfileUpsertPayload(user, {
          name: fullName,
          email: profile.email,
          phone: profile.phone,
          gender: profile.gender,
          position: profile.position,
          id_passport: profile.id_passport,
          license: "",
          avatar_url: profile.avatar_url || null,
          profile_completed: completionPercent === 100,
        }),
        date_of_birth: profile.date_of_birth || null,
        address: profile.address || null,
        status: "active",
      } as any);
      const savedRow = await saveProfileRecord(supabase, payload as any);
      const normalized = normalizeProfileRecord(savedRow as any, user);
      const [first_name, ...surnameParts] = normalized.name
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      setProfile({
        first_name: first_name || "",
        surname: surnameParts.join(" "),
        email: normalized.email,
        date_of_birth:
          ((savedRow as any)?.date_of_birth as string | undefined) ??
          profile.date_of_birth,
        phone: normalized.phone,
        address: ((savedRow as any)?.address as string | undefined) ?? "",
        gender: normalized.gender,
        position: normalized.position,
        id_passport: normalized.id_passport,
        avatar_url: normalized.avatar_url || "",
        employment_type:
          normalized.employment_type === "part_time"
            ? "part_time"
            : "full_time",
        working_hours: normalized.working_hours
          ? String(normalized.working_hours)
          : "9",
      });
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file?: File) => {
    if (!user || !file) return;
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatars/employee-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("profile-images")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage
        .from("profile-images")
        .getPublicUrl(path);
      setProfile((prev) => ({ ...prev, avatar_url: data.publicUrl }));
      toast({
        title: "Image uploaded",
        description: "Click Save Changes to apply profile image.",
      });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setUploadingImage(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="text-muted-foreground">
          Manage your personal information
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Profile Completion</CardTitle>
          <div className="flex items-center gap-3 mt-2">
            <Progress value={completionPercent} className="flex-1" />
            <span className="text-sm font-medium text-muted-foreground">
              {completionPercent}%
            </span>
          </div>
        </CardHeader>
      </Card>

      <Card className="overflow-hidden rounded-3xl">
        <CardContent className="pt-8 pb-8">
          <div className="mb-6 flex flex-col items-center gap-3">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Profile"
                className="h-20 w-20 rounded-full object-cover border"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold border">
                {(profile.first_name || "E").trim().charAt(0).toUpperCase()}
              </div>
            )}
            <Button variant="outline" className="rounded-xl">
              Edit Profile
            </Button>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={profile.first_name}
                  onChange={(e) =>
                    setProfile({ ...profile, first_name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Surname</Label>
                <Input
                  value={profile.surname}
                  onChange={(e) =>
                    setProfile({ ...profile, surname: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  max={minAllowedDob}
                  value={profile.date_of_birth}
                  onChange={(e) =>
                    setProfile({ ...profile, date_of_birth: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={profile.phone}
                  onChange={(e) =>
                    setProfile({ ...profile, phone: e.target.value })
                  }
                  placeholder="+44 ..."
                />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={profile.email} disabled className="bg-muted" />
              </div>

              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  value={profile.address}
                  onChange={(e) =>
                    setProfile({ ...profile, address: e.target.value })
                  }
                  placeholder="Enter your address"
                />
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select
                  value={profile.gender}
                  onValueChange={(v) => setProfile({ ...profile, gender: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="prefer_not_to_say">
                      Prefer not to say
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Position</Label>
                <Input value={profile.position} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Employment Type</Label>
                <Input
                  value={
                    profile.employment_type === "part_time"
                      ? "Part Time"
                      : "Full Time"
                  }
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>Shift Hours</Label>
                <Input
                  value={
                    profile.employment_type === "part_time"
                      ? `${profile.working_hours}h`
                      : "9h (including break)"
                  }
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label>ID / Passport Number</Label>
                <Input
                  value={profile.id_passport}
                  onChange={(e) =>
                    setProfile({ ...profile, id_passport: e.target.value })
                  }
                  placeholder="Enter ID or passport number"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Profile Picture</Label>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold border">
                    {(profile.first_name || "E").trim().charAt(0).toUpperCase()}
                  </div>
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={uploadingImage}
                    onChange={(e) => handleAvatarUpload(e.target.files?.[0])}
                  />
                </div>
                {uploadingImage && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Uploading
                    image...
                  </p>
                )}
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="animate-spin mr-2" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}{" "}
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
