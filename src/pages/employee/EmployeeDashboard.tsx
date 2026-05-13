import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, FileText, User, CheckCircle2 } from "lucide-react";
import { normalizeLeaveRecord, normalizeProfileRecord } from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeoutFallback } from "@/lib/async";
import { useToast } from "@/hooks/use-toast";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const today = () => new Date().toISOString().slice(0, 10);

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ docs: 0, pendingLeaves: 0, approvedLeaves: 0 });
  const [attendance, setAttendance] = useState<any>(null);
  const [attendanceRows, setAttendanceRows] = useState<Array<{ work_date: string; check_in_at: string | null; check_out_at: string | null }>>([]);
  const [busy, setBusy] = useState(false);

  const fetchAttendance = async (companyId?: string | null) => {
    if (!user || !companyId) return;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);

    const [{ data: todayEntry }, { data: history }] = await withTimeoutFallback(
      Promise.all([
        supabase
          .from("attendance_entries")
          .select("*")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .eq("work_date", today())
          .maybeSingle(),
        supabase
          .from("attendance_entries")
          .select("work_date,check_in_at,check_out_at")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .gte("work_date", from)
          .lte("work_date", to)
          .order("work_date", { ascending: true }),
      ]),
      [{ data: null, error: null }, { data: [], error: null }] as any,
      SUPABASE_REQUEST_TIMEOUT_MS,
    );

    setAttendance(todayEntry ?? null);
    setAttendanceRows((history as Array<{ work_date: string; check_in_at: string | null; check_out_at: string | null }>) ?? []);
  };

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      try {
        const [{ data: prof }, { data: docs }, { data: leaves }] = await withTimeoutFallback(
          Promise.all([
            supabase.from("employee_profiles").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
            supabase.from("documents").select("id").eq("user_id", user.id),
            supabase.from("leave_requests").select("status").eq("user_id", user.id),
          ]),
          [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }] as any,
          SUPABASE_REQUEST_TIMEOUT_MS,
        );

        const normalizedProfile = normalizeProfileRecord((prof as any[])?.[0], user);
        const normalizedLeaves = ((leaves as any[]) ?? []).map((leave) => normalizeLeaveRecord(leave));
        setProfile(normalizedProfile);
        setStats({
          docs: docs?.length ?? 0,
          pendingLeaves: normalizedLeaves.filter((leave) => leave.status === "pending").length,
          approvedLeaves: normalizedLeaves.filter((leave) => leave.status === "approved").length,
        });
        await fetchAttendance((prof as any[])?.[0]?.company_id ?? null);
      } catch (err) {
        console.error("Failed to fetch employee dashboard:", err);
      }
    };
    fetch();
  }, [user]);

  const upsertAttendance = async (mode: "in" | "out") => {
    if (!user || !profile?.company_id) {
      toast({ title: "Attendance unavailable", description: "Your profile is not linked to a company yet.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const payload: any = {
      company_id: profile.company_id,
      user_id: user.id,
      work_date: today(),
    };
    if (mode === "in") payload.check_in_at = new Date().toISOString();
    if (mode === "out") payload.check_out_at = new Date().toISOString();

    const { error } = await supabase.from("attendance_entries").upsert(payload, { onConflict: "company_id,user_id,work_date" });
    setBusy(false);
    if (error) {
      toast({ title: "Attendance failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: mode === "in" ? "Checked in" : "Checked out" });
    fetchAttendance(profile.company_id);
  };

  const cards = [
    { title: "Profile Status", value: profile?.profile_completed ? "Complete" : "Incomplete", icon: User, color: profile?.profile_completed ? "text-success" : "text-warning" },
    { title: "Documents", value: stats.docs, icon: FileText, color: "text-primary" },
    { title: "Pending Leaves", value: stats.pendingLeaves, icon: CalendarDays, color: "text-warning" },
    { title: "Approved Leaves", value: stats.approvedLeaves, icon: CheckCircle2, color: "text-success" },
  ];

  const attendanceChartData = useMemo(() => {
    const map = new Map(attendanceRows.map((row) => [row.work_date, row]));
    const end = new Date();
    const points: Array<{ date: string; hours: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const row = map.get(dateKey);
      let hours = 0;
      if (row?.check_in_at && row?.check_out_at) {
        const diff = new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime();
        if (diff > 0) hours = Number((diff / 3600000).toFixed(2));
      }
      points.push({ date: dateKey.slice(5), hours });
    }
    return points;
  }, [attendanceRows]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {profile?.name || "Employee"}</h1>
        <p className="text-muted-foreground">Your personal dashboard</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Today Attendance</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">Check-in: {attendance?.check_in_at ? new Date(attendance.check_in_at).toLocaleString() : "-"}</p>
          <p className="text-sm text-muted-foreground">Check-out: {attendance?.check_out_at ? new Date(attendance.check_out_at).toLocaleString() : "-"}</p>
          <div className="flex gap-2">
            <Button disabled={busy || !!attendance?.check_in_at} onClick={() => upsertAttendance("in")}>Check In</Button>
            <Button variant="outline" disabled={busy || !attendance?.check_in_at || !!attendance?.check_out_at} onClick={() => upsertAttendance("out")}>Check Out</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Attendance Report (Last 30 Days)</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              hours: {
                label: "Hours",
                color: "hsl(var(--primary))",
              },
            }}
            className="h-[260px] w-full"
          >
            <LineChart data={attendanceChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} domain={[0, 12]} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line dataKey="hours" type="monotone" stroke="var(--color-hours)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{card.value}</div></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
