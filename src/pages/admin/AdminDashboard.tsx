import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, CalendarClock } from "lucide-react";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, pendingLeaves: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const { data: profiles } = await supabase.from("employee_profiles").select("status");
      const { data: leaves } = await supabase.from("leave_requests").select("status").eq("status", "pending");

      const total = profiles?.length ?? 0;
      const active = profiles?.filter((p) => p.status === "active").length ?? 0;
      const inactive = profiles?.filter((p) => p.status === "inactive").length ?? 0;
      setStats({ total, active, inactive, pendingLeaves: leaves?.length ?? 0 });
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
