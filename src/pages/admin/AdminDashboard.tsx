import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Users, UserCheck, UserX, CalendarClock, MoreVertical, ChevronRight } from "lucide-react";
import { filterEmployeeProfiles, normalizeLeaveRecord, normalizeProfileRecord, type LeaveRecord, type ProfileRecord } from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeoutFallback } from "@/lib/async";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, pendingLeaves: 0 });
  const [recentLeaves, setRecentLeaves] = useState<Array<LeaveRecord & { employee: ProfileRecord | null }>>([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<Array<LeaveRecord & { employee: ProfileRecord | null }>>([]);
  const [teamStatus, setTeamStatus] = useState<Array<{ name: string; status: "in_shift" | "checked_out" | "not_checked_in" | "on_break" }>>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [{ data: profiles, error: profilesError }, { data: leaves, error: leavesError }, { data: roleRows, error: rolesError }] = await withTimeoutFallback(
          Promise.all([
            supabase.from("employee_profiles").select("*"),
            supabase.from("leave_requests").select("status"),
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
        const todayDateKey = new Date().toISOString().slice(0, 10);
        const { data: attendanceToday } = await supabase
          .from("attendance_entries")
          .select("user_id,check_in_at,check_out_at,break_started_at")
          .eq("work_date", todayDateKey);

        const attendanceByUser = new Map((attendanceToday ?? []).map((row: any) => [row.user_id, row]));
        setTeamStatus(
          employeeProfiles.slice(0, 8).map((employee) => {
            const row: any = employee.user_id ? attendanceByUser.get(employee.user_id) : null;
            const status: "in_shift" | "checked_out" | "not_checked_in" | "on_break" = row?.check_in_at
              ? row?.check_out_at
                ? "checked_out"
                : row?.break_started_at
                  ? "on_break"
                  : "in_shift"
              : "not_checked_in";
            return { name: employee.name || employee.email || "Employee", status };
          }),
        );

        const normalizedLeaves = ((leaves as any[]) ?? []).map((leave) => normalizeLeaveRecord(leave));
        const profileByUserId = new Map(employeeProfiles.filter((p) => !!p.user_id).map((p) => [p.user_id as string, p]));
        const leavesWithEmployees = normalizedLeaves.map((leave) => ({
          ...leave,
          employee: profileByUserId.get(leave.user_id) ?? null,
        }));

        const total = employeeProfiles.length;
        const active = employeeProfiles.filter((profile) => profile.status === "active").length;
        const inactive = employeeProfiles.filter((profile) => profile.status === "inactive").length;
        setStats({ total, active, inactive, pendingLeaves: normalizedLeaves.filter((leave) => leave.status === "pending").length });

        setRecentLeaves(
          [...leavesWithEmployees]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5),
        );

        const today = new Date();
        const upcoming = leavesWithEmployees
          .filter((leave) => {
            if (leave.status !== "pending" && leave.status !== "approved") return false;
            const start = new Date(`${leave.start_date}T00:00:00`);
            return start.getTime() >= new Date(today.toDateString()).getTime();
          })
          .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
          .slice(0, 2);
        setUpcomingDeadlines(upcoming);
      } catch (err) {
        console.error("Failed to fetch admin dashboard:", err);
      }
    };
    fetchStats();
  }, []);

  const cards = [
    { title: "Total Employees", value: stats.total, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "Active", value: stats.active, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: "Inactive", value: stats.inactive, icon: UserX, color: "text-gray-400", bg: "bg-gray-50" },
    { title: "Pending Leaves", value: stats.pendingLeaves, icon: CalendarClock, color: "text-amber-600", bg: "bg-amber-50" },
  ];

  const workspaceUsage = stats.total > 0 ? Math.min(100, Math.round((stats.active / stats.total) * 100)) : 0;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back, Admin. Here is what&apos;s happening today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <Card key={card.title} className="rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className={`p-3 rounded-xl ${card.bg} ${card.color}`}>
                  <card.icon size={24} />
                </div>
                <button className="text-slate-300 hover:text-slate-500 transition-colors" type="button" aria-label="More">
                  <MoreVertical size={18} />
                </button>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold">{card.value}</p>
                <p className="text-sm font-medium text-slate-500 mt-1">{card.title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold">Recent Leave Requests</h2>
            <button className="text-blue-600 text-sm font-semibold hover:underline" type="button">View All</button>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Requested</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLeaves.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-500">No leave requests yet.</td>
                  </tr>
                ) : recentLeaves.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold">
                          {(row.employee?.name || row.employee?.email || "E").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-medium">{row.employee?.name || row.employee?.email || "-"}</span>
                          <p className="text-xs text-slate-500 capitalize">{row.leave_type} leave</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        row.status === "pending" ? "bg-amber-100 text-amber-800" :
                        row.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                      }`}>
                        {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{new Date(row.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-slate-400 hover:text-slate-600" type="button" aria-label="Open">
                        <ChevronRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="font-bold mb-6">Quick Overview</h2>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-500">Workspace Usage</span>
                <span className="font-semibold">{workspaceUsage}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${workspaceUsage}%` }} />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Upcoming Deadlines</h3>
              <div className="space-y-4">
                {upcomingDeadlines.length === 0 ? (
                  <p className="text-sm text-slate-500">No upcoming leave starts.</p>
                ) : upcomingDeadlines.map((leave) => {
                  const d = new Date(`${leave.start_date}T00:00:00`);
                  return (
                  <div key={leave.id} className="flex gap-4">
                    <div className="w-10 h-10 shrink-0 bg-slate-100 rounded-xl flex flex-col items-center justify-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">{d.toLocaleDateString(undefined, { month: "short" })}</span>
                      <span className="text-sm font-bold text-slate-900 leading-none">{d.getDate()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{leave.employee?.name || leave.employee?.email || "-"}</p>
                      <p className="text-xs text-slate-500 capitalize">{leave.leave_type} leave starts</p>
                    </div>
                  </div>
                )})}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Team Status</h3>
              <div className="flex flex-wrap gap-4">
                {teamStatus.length === 0 ? (
                  <p className="text-sm text-slate-500">No employee status available.</p>
                ) : teamStatus.map((member) => (
                  <div key={member.name} className="text-center">
                    <div className="relative">
                      <div className="h-10 w-10 rounded-full bg-slate-100 border flex items-center justify-center text-xs font-bold text-slate-700">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                        member.status === "in_shift" ? "bg-emerald-500" : member.status === "checked_out" ? "bg-amber-400" : member.status === "on_break" ? "bg-blue-500" : "bg-slate-300"
                      }`} />
                    </div>
                    <p className="text-[11px] mt-1 text-slate-500 max-w-16 truncate">{member.name}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
