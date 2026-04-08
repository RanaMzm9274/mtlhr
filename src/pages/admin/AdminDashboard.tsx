import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, CalendarClock } from "lucide-react";
import { filterEmployeeProfiles, normalizeProfileRecord } from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeoutFallback } from "@/lib/async";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, pendingLeaves: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [{ data: profiles, error: profilesError }, { data: leaves, error: leavesError }, { data: roleRows, error: rolesError }] = await withTimeoutFallback(
          Promise.all([
            supabase.from("employee_profiles").select("*"),
            supabase.from("leave_requests").select("status").eq("status", "pending"),
            supabase.from("user_roles").select("user_id, role"),
          ]),
          [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ] as any,
          SUPABASE_REQUEST_TIMEOUT_MS,
        );

        if (profilesError) throw profilesError;
        if (leavesError) throw leavesError;
        if (rolesError) throw rolesError;

        const normalizedProfiles = ((profiles as any[]) ?? []).map((profile) => normalizeProfileRecord(profile));
        const employeeProfiles = filterEmployeeProfiles(normalizedProfiles, roleRows ?? []);
        const total = employeeProfiles.length;
        const active = employeeProfiles.filter((profile) => profile.status === "active").length;
        const inactive = employeeProfiles.filter((profile) => profile.status === "inactive").length;
        setStats({ total, active, inactive, pendingLeaves: leaves?.length ?? 0 });
      } catch (err) {
        console.error("Failed to fetch admin dashboard:", err);
      }
    };
    fetchStats();
  }, []);

  const cards = [
    { title: "Total Employees", value: stats.total, icon: Users, color: "text-primary" },
    { title: "Active", value: stats.active, icon: UserCheck, color: "text-success" },
    { title: "Inactive", value: stats.inactive, icon: UserX, color: "text-muted-foreground" },
    { title: "Pending Leaves", value: stats.pendingLeaves, icon: CalendarClock, color: "text-warning" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, Admin</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
