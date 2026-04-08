import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, FileText, User, CheckCircle2 } from "lucide-react";
import { normalizeLeaveRecord, normalizeProfileRecord } from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeoutFallback } from "@/lib/async";

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ docs: 0, pendingLeaves: 0, approvedLeaves: 0 });

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      try {
        const [{ data: prof, error: profileError }, { data: docs, error: docsError }, { data: leaves, error: leavesError }] = await withTimeoutFallback(
          Promise.all([
            supabase.from("employee_profiles").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
            supabase.from("documents").select("id").eq("user_id", user.id),
            supabase.from("leave_requests").select("status").eq("user_id", user.id),
          ]),
          [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ] as any,
          SUPABASE_REQUEST_TIMEOUT_MS,
        );

        if (profileError) throw profileError;
        if (docsError) throw docsError;
        if (leavesError) throw leavesError;

        const normalizedProfile = normalizeProfileRecord((prof as any[])?.[0], user);
        const normalizedLeaves = ((leaves as any[]) ?? []).map((leave) => normalizeLeaveRecord(leave));
        setProfile(normalizedProfile);
        setStats({
          docs: docs?.length ?? 0,
          pendingLeaves: normalizedLeaves.filter((leave) => leave.status === "pending").length,
          approvedLeaves: normalizedLeaves.filter((leave) => leave.status === "approved").length,
        });
      } catch (err) {
        console.error("Failed to fetch employee dashboard:", err);
      }
    };
    fetch();
  }, [user]);

  const cards = [
    { title: "Profile Status", value: profile?.profile_completed ? "Complete" : "Incomplete", icon: User, color: profile?.profile_completed ? "text-success" : "text-warning" },
    { title: "Documents", value: stats.docs, icon: FileText, color: "text-primary" },
    { title: "Pending Leaves", value: stats.pendingLeaves, icon: CalendarDays, color: "text-warning" },
    { title: "Approved Leaves", value: stats.approvedLeaves, icon: CheckCircle2, color: "text-success" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {profile?.name || "Employee"}</h1>
        <p className="text-muted-foreground">Your personal dashboard</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
