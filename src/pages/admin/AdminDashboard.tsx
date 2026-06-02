import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Users, UserCheck, UserX, CalendarClock, MoreVertical, ChevronRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { filterEmployeeProfiles, normalizeLeaveRecord, normalizeProfileRecord, type LeaveRecord, type ProfileRecord } from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeoutFallback } from "@/lib/async";
import { usePortalSearch } from "@/contexts/PortalSearchContext";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function AdminDashboard() {
  const { companySlug, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { searchTerm } = usePortalSearch();
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, pendingLeaves: 0 });
  const [recentLeaves, setRecentLeaves] = useState<Array<LeaveRecord & { employee: ProfileRecord | null }>>([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<Array<LeaveRecord & { employee: ProfileRecord | null }>>([]);
  const [teamStatus, setTeamStatus] = useState<Array<{ name: string; status: "in_shift" | "checked_out" | "not_checked_in" | "on_break" }>>([]);
  const [attendanceTrend, setAttendanceTrend] = useState<Array<{ date: string; present: number }>>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<Array<{ id: string; name: string; date_from: string; date_to: string }>>([]);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDateFrom, setHolidayDateFrom] = useState("");
  const [holidayDateTo, setHolidayDateTo] = useState("");
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [deletingHolidayId, setDeletingHolidayId] = useState<string | null>(null);
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
  const [editHolidayName, setEditHolidayName] = useState("");
  const [editHolidayDateFrom, setEditHolidayDateFrom] = useState("");
  const [editHolidayDateTo, setEditHolidayDateTo] = useState("");
  const [updatingHoliday, setUpdatingHoliday] = useState(false);
  const todayDate = new Date().toISOString().slice(0, 10);

  const loadHolidays = async (resolvedCompanyId: string) => {
    const { data } = await supabase
      .from("company_holidays")
      .select("id,name,date_from,date_to")
      .eq("company_id", resolvedCompanyId)
      .order("date_from", { ascending: true });
    setHolidays((data as Array<{ id: string; name: string; date_from: string; date_to: string }>) ?? []);
  };

  useEffect(() => {
    if (!companySlug) return;
    supabase
      .from("companies")
      .select("id")
      .eq("slug", companySlug)
      .maybeSingle()
      .then(({ data }) => {
        const nextCompanyId = data?.id ?? null;
        setCompanyId(nextCompanyId);
        if (nextCompanyId) void loadHolidays(nextCompanyId);
      });
  }, [companySlug]);

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

        const employeeUserIds = employeeProfiles.map((profile) => profile.user_id).filter(Boolean) as string[];
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 6);
        const startKey = start.toISOString().slice(0, 10);
        const endKey = end.toISOString().slice(0, 10);

        let attendanceRows: any[] = [];
        if (employeeUserIds.length > 0) {
          const { data } = await supabase
            .from("attendance_entries")
            .select("work_date,user_id,check_in_at")
            .in("user_id", employeeUserIds)
            .gte("work_date", startKey)
            .lte("work_date", endKey)
            .order("work_date", { ascending: true });
          attendanceRows = data ?? [];
        }
        const presentByDate = new Map<string, Set<string>>();
        attendanceRows.forEach((row) => {
          if (!row.check_in_at) return;
          const set = presentByDate.get(row.work_date) ?? new Set<string>();
          set.add(row.user_id);
          presentByDate.set(row.work_date, set);
        });
        const trendData: Array<{ date: string; present: number }> = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const key = d.toISOString().slice(0, 10);
          trendData.push({
            date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
            present: (presentByDate.get(key) ?? new Set<string>()).size,
          });
        }
        setAttendanceTrend(trendData);

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
    { title: "Total Employees", value: stats.total, icon: Users, color: "text-blue-600", bg: "bg-blue-50", path: "/employees" },
    { title: "Active", value: stats.active, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50", path: "/employees?status=active" },
    { title: "Inactive", value: stats.inactive, icon: UserX, color: "text-gray-400", bg: "bg-gray-50", path: "/employees?status=inactive" },
    { title: "Pending Leaves", value: stats.pendingLeaves, icon: CalendarClock, color: "text-amber-600", bg: "bg-amber-50", path: "/leaves?status=pending" },
  ];

  const workspaceUsage = stats.total > 0 ? Math.min(100, Math.round((stats.active / stats.total) * 100)) : 0;
  const query = searchTerm.trim().toLowerCase();
  const filteredRecentLeaves = useMemo(
    () =>
      !query
        ? recentLeaves
        : recentLeaves.filter((leave) =>
            `${leave.employee?.name || ""} ${leave.employee?.email || ""} ${leave.leave_type} ${leave.status}`.toLowerCase().includes(query),
          ),
    [recentLeaves, query],
  );
  const filteredUpcomingDeadlines = useMemo(
    () =>
      !query
        ? upcomingDeadlines
        : upcomingDeadlines.filter((leave) =>
            `${leave.employee?.name || ""} ${leave.employee?.email || ""} ${leave.leave_type} ${leave.status}`.toLowerCase().includes(query),
          ),
    [upcomingDeadlines, query],
  );
  const filteredTeamStatus = useMemo(
    () => (!query ? teamStatus : teamStatus.filter((member) => member.name.toLowerCase().includes(query))),
    [teamStatus, query],
  );

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !holidayName.trim() || !holidayDateFrom || !holidayDateTo) return;
    if (holidayDateFrom < todayDate || holidayDateTo < todayDate) {
      toast({ title: "Invalid date", description: "Past dates are not allowed for holidays.", variant: "destructive" });
      return;
    }
    if (holidayDateFrom > holidayDateTo) {
      toast({ title: "Invalid range", description: "Date From must be earlier than or equal to Date To.", variant: "destructive" });
      return;
    }
    setSavingHoliday(true);
    const { error } = await supabase.from("company_holidays").insert({
      company_id: companyId,
      name: holidayName.trim(),
      date_from: holidayDateFrom,
      date_to: holidayDateTo,
      holiday_date: holidayDateFrom as any,
      created_by: user?.id ?? null,
    } as any);
    setSavingHoliday(false);
    if (error) {
      toast({ title: "Holiday update failed", description: error.message, variant: "destructive" });
      return;
    }
    setHolidayName("");
    setHolidayDateFrom("");
    setHolidayDateTo("");
    toast({ title: "Holidays updated", description: "Holiday added successfully." });
    void loadHolidays(companyId);
  };

  const removeHoliday = async (holidayId: string) => {
    setDeletingHolidayId(holidayId);
    const { error } = await supabase.from("company_holidays").delete().eq("id", holidayId);
    setDeletingHolidayId(null);
    if (error) {
      toast({ title: "Holiday update failed", description: error.message, variant: "destructive" });
      return;
    }
    if (!companyId) return;
    toast({ title: "Holidays updated", description: "Holiday removed successfully." });
    void loadHolidays(companyId);
  };

  const startEditHoliday = (holiday: { id: string; name: string; date_from: string; date_to: string }) => {
    setEditingHolidayId(holiday.id);
    setEditHolidayName(holiday.name);
    setEditHolidayDateFrom(holiday.date_from);
    setEditHolidayDateTo(holiday.date_to);
  };

  const saveHolidayUpdate = async () => {
    if (!editingHolidayId || !companyId || !editHolidayName.trim() || !editHolidayDateFrom || !editHolidayDateTo) return;
    if (editHolidayDateFrom < todayDate || editHolidayDateTo < todayDate) {
      toast({ title: "Invalid date", description: "Past dates are not allowed for holidays.", variant: "destructive" });
      return;
    }
    if (editHolidayDateFrom > editHolidayDateTo) {
      toast({ title: "Invalid range", description: "Date From must be earlier than or equal to Date To.", variant: "destructive" });
      return;
    }

    setUpdatingHoliday(true);
    const { error } = await supabase
      .from("company_holidays")
      .update({
        name: editHolidayName.trim(),
        date_from: editHolidayDateFrom,
        date_to: editHolidayDateTo,
        holiday_date: editHolidayDateFrom as any,
      } as any)
      .eq("id", editingHolidayId);
    setUpdatingHoliday(false);

    if (error) {
      toast({ title: "Holiday update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Holidays updated", description: "Holiday updated successfully." });
    setEditingHolidayId(null);
    setEditHolidayName("");
    setEditHolidayDateFrom("");
    setEditHolidayDateTo("");
    void loadHolidays(companyId);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back, Admin. Here is what&apos;s happening today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <Card
            key={card.title}
            className="rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate(card.path)}
          >
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className={`p-3 rounded-xl ${card.bg} ${card.color}`}>
                  <card.icon size={24} />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="text-slate-300 hover:text-slate-500 transition-colors"
                      type="button"
                      aria-label="Widget options"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical size={18} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(card.path)}>Open</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.location.reload()}>Refresh data</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
            <h2 className="font-bold">Employee Attendance Trend (Last 7 Days)</h2>
            <button className="text-blue-600 text-sm font-semibold hover:underline" type="button" onClick={() => navigate("/attendance")}>View Attendance</button>
          </div>
          <div className="p-6">
            <ChartContainer
              className="h-[300px] w-full"
              config={{
                present: { label: "Present", color: "hsl(var(--primary))" },
              }}
            >
              <LineChart data={attendanceTrend} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis allowDecimals={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="present" stroke="var(--color-present)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ChartContainer>
            {attendanceTrend.length === 0 ? (
              <p className="text-center text-sm text-slate-500 mt-4">No attendance data available yet.</p>
            ) : null}
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
                {filteredUpcomingDeadlines.length === 0 ? (
                  <p className="text-sm text-slate-500">No upcoming leave starts.</p>
                ) : filteredUpcomingDeadlines.map((leave) => {
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
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Recent Employee Leaves</h3>
              <div className="space-y-3">
                {filteredRecentLeaves.length === 0 ? (
                  <p className="text-sm text-slate-500">No recent leave requests.</p>
                ) : filteredRecentLeaves.slice(0, 3).map((leave) => (
                  <div key={`recent-quick-${leave.id}`} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{leave.employee?.name || leave.employee?.email || "-"}</p>
                      <p className="text-xs text-slate-500 capitalize">
                        {leave.leave_type} leave • {new Date(leave.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      leave.status === "pending"
                        ? "bg-amber-100 text-amber-800"
                        : leave.status === "approved"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                    }`}>
                      {leave.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Team Status</h3>
              <div className="flex flex-wrap gap-4">
                {filteredTeamStatus.length === 0 ? (
                  <p className="text-sm text-slate-500">No employee status available.</p>
                ) : filteredTeamStatus.map((member) => (
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

            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Holiday Management</h3>
              <form onSubmit={addHoliday} className="space-y-2">
                <Input value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="Holiday name" />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" min={todayDate} value={holidayDateFrom} onChange={(e) => setHolidayDateFrom(e.target.value)} />
                  <Input type="date" min={todayDate} value={holidayDateTo} onChange={(e) => setHolidayDateTo(e.target.value)} />
                </div>
                <Button type="submit" size="sm" disabled={savingHoliday || !companyId}>
                  {savingHoliday ? "Adding..." : "Add Holiday"}
                </Button>
              </form>
              <div className="mt-3 space-y-2">
                {holidays.length === 0 ? (
                  <p className="text-sm text-slate-500">No holidays configured.</p>
                ) : (
                  holidays.slice(0, 6).map((holiday) => (
                    <div key={holiday.id} className="flex items-center justify-between rounded-md border p-2">
                      {editingHolidayId === holiday.id ? (
                        <div className="w-full space-y-2">
                          <Input value={editHolidayName} onChange={(e) => setEditHolidayName(e.target.value)} />
                          <div className="grid grid-cols-2 gap-2">
                            <Input type="date" min={todayDate} value={editHolidayDateFrom} onChange={(e) => setEditHolidayDateFrom(e.target.value)} />
                            <Input type="date" min={todayDate} value={editHolidayDateTo} onChange={(e) => setEditHolidayDateTo(e.target.value)} />
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" size="sm" onClick={() => void saveHolidayUpdate()} disabled={updatingHoliday}>
                              {updatingHoliday ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingHolidayId(null);
                                setEditHolidayName("");
                                setEditHolidayDateFrom("");
                                setEditHolidayDateTo("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <p className="text-sm font-medium">{holiday.name}</p>
                            <p className="text-xs text-slate-500">
                              {new Date(`${holiday.date_from}T00:00:00`).toLocaleDateString()} - {new Date(`${holiday.date_to}T00:00:00`).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => startEditHoliday(holiday)}>
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void removeHoliday(holiday.id)}
                              disabled={deletingHolidayId === holiday.id}
                            >
                              {deletingHolidayId === holiday.id ? "..." : "Remove"}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
