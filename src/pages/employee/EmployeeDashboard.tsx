import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, FileText, User, CheckCircle2, MapPin, Clock3, LogOut } from "lucide-react";
import { normalizeLeaveRecord, normalizeProfileRecord } from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeoutFallback } from "@/lib/async";
import { useToast } from "@/hooks/use-toast";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const today = () => new Date().toISOString().slice(0, 10);
const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ docs: 0, pendingLeaves: 0, approvedLeaves: 0 });
  const [attendance, setAttendance] = useState<any>(null);
  const [attendanceRows, setAttendanceRows] = useState<Array<{ work_date: string; check_in_at: string | null; check_out_at: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [selectedBreakMinutes, setSelectedBreakMinutes] = useState(15);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [upcomingHolidays, setUpcomingHolidays] = useState<Array<{ mon: string; day: string; name: string; rangeText: string }>>([]);
  const autoCheckoutDoneFor = useRef<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

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

    let activeEntry = todayEntry ?? null;
    if (!activeEntry) {
      const { data: latestOpenEntry } = await withTimeoutFallback(
        supabase
          .from("attendance_entries")
          .select("*")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .is("check_out_at", null)
          .order("check_in_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        { data: null, error: null } as any,
        SUPABASE_REQUEST_TIMEOUT_MS,
      );
      activeEntry = latestOpenEntry ?? null;
    }

    setAttendance(activeEntry);
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
        const resolvedCompanyId = (prof as any[])?.[0]?.company_id ?? null;
        const normalizedLeaves = ((leaves as any[]) ?? []).map((leave) => normalizeLeaveRecord(leave));
        setProfile(normalizedProfile);
        setCompanyId(resolvedCompanyId);
        setStats({
          docs: docs?.length ?? 0,
          pendingLeaves: normalizedLeaves.filter((leave) => leave.status === "pending").length,
          approvedLeaves: normalizedLeaves.filter((leave) => leave.status === "approved").length,
        });
        await fetchAttendance(resolvedCompanyId);
      } catch (err) {
        console.error("Failed to fetch employee dashboard:", err);
      }
    };
    fetch();
  }, [user]);

  useEffect(() => {
    if (!companyId) return;
    if (!attendance?.check_in_at || attendance?.check_out_at) return;
    const interval = setInterval(() => {
      void fetchAttendance(companyId);
    }, 30000);
    return () => clearInterval(interval);
  }, [attendance?.check_in_at, attendance?.check_out_at, companyId]);

  useEffect(() => {
    if (!companyId) {
      setUpcomingHolidays([]);
      return;
    }
    const todayDate = new Date().toISOString().slice(0, 10);
    supabase
      .from("company_holidays")
      .select("name,date_from,date_to")
      .eq("company_id", companyId)
      .gte("date_to", todayDate)
      .order("date_from", { ascending: true })
      .limit(6)
      .then(({ data }) => {
        const mapped = ((data as Array<{ name: string; date_from: string; date_to: string }>) ?? []).map((holiday) => {
          const date = new Date(`${holiday.date_from}T00:00:00`);
          const rangeText =
            holiday.date_from === holiday.date_to
              ? new Date(`${holiday.date_from}T00:00:00`).toLocaleDateString()
              : `${new Date(`${holiday.date_from}T00:00:00`).toLocaleDateString()} - ${new Date(`${holiday.date_to}T00:00:00`).toLocaleDateString()}`;
          return {
            mon: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
            day: String(date.getDate()).padStart(2, "0"),
            name: holiday.name,
            rangeText,
          };
        });
        setUpcomingHolidays(mapped);
      });
  }, [companyId]);

  const upsertAttendance = async (mode: "in" | "out") => {
    if (!user || !profile?.company_id) {
      toast({ title: "Attendance unavailable", description: "Your profile is not linked to a company yet.", variant: "destructive" });
      return;
    }
    setBusy(true);
    if (mode === "out") {
      const { error: closeRpcError } = await withTimeoutFallback(
        supabase.rpc("close_my_open_attendance", {
          p_company_id: profile.company_id,
        }),
        { error: null } as any,
        SUPABASE_REQUEST_TIMEOUT_MS,
      );

      const closeRpcMissing =
        !!closeRpcError &&
        (closeRpcError.message.includes("Could not find the function public.close_my_open_attendance") ||
          closeRpcError.message.includes("close_my_open_attendance"));

      if (!closeRpcError) {
        setBusy(false);
        toast({ title: "Checked out" });
        fetchAttendance(profile.company_id);
        return;
      }

      if (!closeRpcMissing) {
        setBusy(false);
        toast({ title: "Attendance failed", description: closeRpcError.message, variant: "destructive" });
        return;
      }

      // Legacy fallback for DBs without close_my_open_attendance migration.
      const { error: legacyOutError } = await withTimeoutFallback(
        supabase.rpc("record_my_attendance", {
          p_company_id: profile.company_id,
          p_mode: "out",
        }),
        { error: null } as any,
        SUPABASE_REQUEST_TIMEOUT_MS,
      );

      setBusy(false);
      if (legacyOutError) {
        toast({ title: "Attendance failed", description: legacyOutError.message, variant: "destructive" });
        return;
      }

      toast({ title: "Checked out" });
      fetchAttendance(profile.company_id);
      return;
    }

    const { error } = await supabase.rpc("record_my_attendance", {
      p_company_id: profile.company_id,
      p_mode: mode,
    });
    const rpcMissing =
      !!error &&
      (error.message.includes("Could not find the function public.record_my_attendance") ||
        error.message.includes("record_my_attendance"));

    if (rpcMissing) {
      const payload: any = {
        company_id: profile.company_id,
        user_id: user.id,
        work_date: today(),
      };
      if (mode === "in") payload.check_in_at = new Date().toISOString();
      if (mode === "out") payload.check_out_at = new Date().toISOString();
      const { error: fallbackError } = await supabase
        .from("attendance_entries")
        .upsert(payload, { onConflict: "company_id,user_id,work_date" });
      setBusy(false);
      if (fallbackError) {
        toast({ title: "Attendance failed", description: fallbackError.message, variant: "destructive" });
        return;
      }
      toast({ title: mode === "in" ? "Checked in" : "Checked out" });
      fetchAttendance(profile.company_id);
      return;
    }
    setBusy(false);
    if (error) {
      toast({ title: "Attendance failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: mode === "in" ? "Checked in" : "Checked out" });
    fetchAttendance(profile.company_id);
  };

  useEffect(() => {
    const attendanceId = (attendance as any)?.id as string | undefined;
    const checkInAt = (attendance as any)?.check_in_at as string | null | undefined;
    const checkOutAt = (attendance as any)?.check_out_at as string | null | undefined;
    const scheduledEnd = ((attendance as any)?.scheduled_end as string | null | undefined) ?? ((profile as any)?.shift_end as string | null | undefined);
    if (!attendanceId || !checkInAt || checkOutAt || !scheduledEnd || busy) return;
    if (autoCheckoutDoneFor.current === attendanceId) return;

    const timeParts = scheduledEnd.split(":").map((part) => Number(part));
    if (timeParts.length < 2 || timeParts.some((part) => Number.isNaN(part))) return;

    const [hours, minutes, seconds = 0] = timeParts;
    const checkInDate = new Date(checkInAt);
    const shiftEndDateTime = new Date(checkInDate);
    shiftEndDateTime.setHours(hours, minutes, seconds, 0);

    // If shift end time is earlier than check-in, treat it as an overnight shift.
    if (shiftEndDateTime.getTime() < checkInDate.getTime()) {
      shiftEndDateTime.setDate(shiftEndDateTime.getDate() + 1);
    }

    const autoCheckoutAtMs = shiftEndDateTime.getTime() + (15 * 60 * 1000);
    if (nowTick < autoCheckoutAtMs) return;

    autoCheckoutDoneFor.current = attendanceId;
    void upsertAttendance("out");
  }, [attendance, busy, nowTick, profile]);
  const breakUsedMinutes = Number((attendance as any)?.break_minutes ?? 0);
  const onBreak = !!(attendance as any)?.break_started_at;
  const activeBreakMinutes = Number((attendance as any)?.break_selected_minutes ?? 0) || 0;
  const activeBreakElapsedMinutes = useMemo(() => {
    if (!onBreak || !(attendance as any)?.break_started_at) return 0;
    return Math.max(0, Math.ceil((nowTick - new Date((attendance as any).break_started_at).getTime()) / 60000));
  }, [attendance, nowTick, onBreak]);
  const totalBreakUsedMinutes = Math.min(60, breakUsedMinutes + activeBreakElapsedMinutes);
  const remainingBreakMinutes = Math.max(0, 60 - totalBreakUsedMinutes);
  const activeBreakRemainingMinutes = onBreak ? Math.max(0, activeBreakMinutes - activeBreakElapsedMinutes) : 0;
  const activeBreakProgress = onBreak && activeBreakMinutes > 0 ? `${activeBreakElapsedMinutes}/${activeBreakMinutes} min` : null;

  const toggleBreak = async () => {
    if (!user || !profile?.company_id) return;
    setBusy(true);
    const primaryRpc = await supabase.rpc("record_my_break", {
      p_company_id: profile.company_id,
      p_mode: onBreak ? "end" : "start",
      p_minutes: onBreak ? null : selectedBreakMinutes,
    });
    const secondaryRpc =
      primaryRpc.error
        ? await supabase.rpc("record_my_break", {
            p_company_id: profile.company_id,
            p_mode: onBreak ? "end" : "start",
          } as any)
        : { error: null };
    const error = primaryRpc.error && secondaryRpc.error ? secondaryRpc.error : null;
    const rpcFailed = !!error;

    if (rpcFailed) {
      let activeAttendance = attendance as any;
      if (!activeAttendance?.id) {
        const { data: fallbackEntry } = await withTimeoutFallback(
          supabase
            .from("attendance_entries")
            .select("*")
            .eq("company_id", profile.company_id)
            .eq("user_id", user.id)
            .is("check_out_at", null)
            .order("check_in_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          { data: null, error: null } as any,
          SUPABASE_REQUEST_TIMEOUT_MS,
        );
        activeAttendance = fallbackEntry ?? null;
      }

        if (!activeAttendance?.id) {
          setBusy(false);
          toast({ title: "Break failed", description: "No active shift found. Please clock in first.", variant: "destructive" });
          return;
        }

        if (!onBreak) {
        const { error: startBreakError } = await supabase
          .from("attendance_entries")
          .update({
            break_started_at: new Date().toISOString(),
            break_selected_minutes: selectedBreakMinutes,
          } as any)
          .eq("id", activeAttendance.id);
          setBusy(false);
          if (startBreakError) {
            if (startBreakError.message.includes("break_started_at") || startBreakError.message.includes("break_selected_minutes")) {
            toast({
              title: "Break unavailable",
              description: "Break tracking columns are missing in this company DB. Run the break tracking migration.",
              variant: "destructive",
            });
              return;
            }
            toast({ title: "Break failed", description: startBreakError.message, variant: "destructive" });
            return;
          }
          toast({ title: "Break started", description: `Remaining break: ${remainingBreakMinutes} min.` });
        } else {
          const usedMinutes = Number(activeAttendance.break_minutes ?? 0);
          const startedAt = activeAttendance.break_started_at ? new Date(activeAttendance.break_started_at).getTime() : NaN;
          const elapsedMinutes = Number.isFinite(startedAt)
            ? Math.max(0, Math.ceil((Date.now() - startedAt) / 60000))
            : 0;
          const nextBreakMinutes = Math.min(60, usedMinutes + elapsedMinutes);
          const { error: endBreakError } = await supabase
            .from("attendance_entries")
            .update({
              break_minutes: nextBreakMinutes,
              break_started_at: null,
            break_selected_minutes: null,
          } as any)
          .eq("id", activeAttendance.id);
        setBusy(false);
        if (endBreakError) {
          if (endBreakError.message.includes("break_minutes") || endBreakError.message.includes("break_started_at")) {
            toast({
              title: "Break unavailable",
              description: "Break tracking columns are missing in this company DB. Run the break tracking migration.",
              variant: "destructive",
            });
            return;
          }
          toast({ title: "Break failed", description: endBreakError.message, variant: "destructive" });
            return;
          }
          toast({
            title: "Break ended",
            description: `Break used: ${nextBreakMinutes} min. Remaining break: ${Math.max(0, 60 - nextBreakMinutes)} min.`,
          });
        }

        fetchAttendance(profile.company_id);
        return;
    }

    setBusy(false);
      if (primaryRpc.error && secondaryRpc.error) {
        toast({ title: "Break failed", description: "Break RPC failed and fallback was not possible.", variant: "destructive" });
        return;
      }
      toast({
        title: onBreak ? "Break ended" : "Break started",
        description: onBreak
          ? `Remaining break: ${remainingBreakMinutes} min.`
          : `Remaining break: ${remainingBreakMinutes} min.`,
      });
      fetchAttendance(profile.company_id);
    };

  const cards = [
    { title: "Profile Status", value: profile?.profile_completed ? "Complete" : "Incomplete", icon: User, color: profile?.profile_completed ? "text-success" : "text-warning" },
    { title: "Documents", value: stats.docs, icon: FileText, color: "text-primary" },
    { title: "Pending Leaves", value: stats.pendingLeaves, icon: CalendarDays, color: "text-warning" },
    { title: "Approved Leaves", value: stats.approvedLeaves, icon: CheckCircle2, color: "text-success" },
  ];
  const dashboardCards = [
    { label: "Total Present", value: `${attendanceRows.filter((r) => !!r.check_in_at).length}/30`, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Leaves Taken", value: String(stats.approvedLeaves).padStart(2, "0"), icon: CalendarDays, color: "text-blue-600", bg: "bg-blue-50" },
    {
      label: "Avg. Hours",
      value: `${(() => {
        const complete = attendanceRows.filter((r) => r.check_in_at && r.check_out_at);
        if (!complete.length) return "0.0";
        const total = complete.reduce((sum, r) => sum + (new Date(r.check_out_at as string).getTime() - new Date(r.check_in_at as string).getTime()) / 3600000, 0);
        return (total / complete.length).toFixed(1);
      })()}h`,
      icon: User,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    { label: "Pending Tasks", value: String(stats.pendingLeaves).padStart(2, "0"), icon: FileText, color: "text-amber-600", bg: "bg-amber-50" },
    {
      label: "Break Status",
      value: onBreak ? "On Break" : "Active",
      icon: User,
      color: onBreak ? "text-amber-600" : "text-emerald-600",
      bg: onBreak ? "bg-amber-50" : "bg-emerald-50",
    },
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

  const shiftDurationText = useMemo(() => {
    const openHistoryRow = [...attendanceRows]
      .reverse()
      .find((row) => row.check_in_at && !row.check_out_at);
    const startIso = attendance?.check_in_at || openHistoryRow?.check_in_at;
    if (!startIso) return "00:00:00";
    const startMs = new Date(startIso).getTime();
    const endMs = attendance?.check_out_at ? new Date(attendance.check_out_at).getTime() : nowTick;
    return formatDuration(endMs - startMs);
  }, [attendance?.check_in_at, attendance?.check_out_at, attendanceRows, nowTick]);
  const shiftDurationMs = useMemo(() => {
    const openHistoryRow = [...attendanceRows]
      .reverse()
      .find((row) => row.check_in_at && !row.check_out_at);
    const startIso = attendance?.check_in_at || openHistoryRow?.check_in_at;
    if (!startIso) return 0;
    const startMs = new Date(startIso).getTime();
    const endMs = attendance?.check_out_at ? new Date(attendance.check_out_at).getTime() : nowTick;
    return Math.max(0, endMs - startMs);
  }, [attendance?.check_in_at, attendance?.check_out_at, attendanceRows, nowTick]);
  const targetShiftHours = useMemo(() => {
    const profileEmploymentType = (profile as any)?.employment_type;
    const partTimeHours = Number((profile as any)?.working_hours);
    if (profileEmploymentType === "part_time" && Number.isFinite(partTimeHours) && partTimeHours > 0) {
      return partTimeHours;
    }
    return 8;
  }, [profile]);
  const employmentLabel = useMemo(() => {
    const profileEmploymentType = (profile as any)?.employment_type;
    if (profileEmploymentType === "part_time") {
      return `Part Time (${targetShiftHours}h)`;
    }
    return "Full Time (8h)";
  }, [profile, targetShiftHours]);
  const shiftProgress = useMemo(() => {
    const totalTargetMs = targetShiftHours * 60 * 60 * 1000;
    if (!totalTargetMs) return 0;
    return Math.min(100, Math.round((shiftDurationMs / totalTargetMs) * 100));
  }, [shiftDurationMs, targetShiftHours]);

  const heroDate = useMemo(
    () => new Date(nowTick).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    [nowTick],
  );
  const availableBreakOptions = useMemo(
    () => [15, 30, 45, 60].filter((mins) => mins <= remainingBreakMinutes),
    [remainingBreakMinutes],
  );
  const hasAvailableBreakOptions = availableBreakOptions.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {profile?.name || "Employee"}</h1>
          <p className="text-muted-foreground">Your personal dashboard</p>
          <p className="text-sm text-slate-600 mt-1">
            Employment Type: <span className="font-semibold text-slate-900">{employmentLabel}</span>
          </p>
        </div>
        <div className="text-sm md:text-right">
          <p className="font-semibold text-slate-900">Upcoming Holidays</p>
          {upcomingHolidays.length === 0 ? (
            <p className="text-muted-foreground">No upcoming holidays</p>
          ) : (
            upcomingHolidays.slice(0, 2).map((holiday) => (
              <p key={`${holiday.name}-${holiday.rangeText}`} className="text-slate-600">
                {holiday.name} <span className="text-slate-500">({holiday.rangeText})</span>
              </p>
            ))
          )}
        </div>
      </div>

      <Card className="overflow-hidden rounded-3xl">
        <CardContent className="relative p-5">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-slate-50 -mr-12 -mt-12" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <p className="text-[20px] text-slate-600 font-semibold mb-1">{heroDate}</p>
              <h2 className="text-[56px] leading-none font-black tracking-tight">{shiftDurationText}</h2>
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                <MapPin size={14} />
                <span>Remote - London Office</span>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-700">
                {attendance?.check_in_at
                  ? attendance?.check_out_at
                    ? "Shift completed"
                    : "Shift in progress"
                  : "Not clocked in"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Shift target: {targetShiftHours}h {((profile as any)?.employment_type === "part_time") ? "(part-time working hours)" : "(full-time including break)"} | Progress: {shiftProgress}%
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="h-10 px-5 rounded-xl text-base font-bold" disabled={busy || !!attendance?.check_in_at} onClick={() => upsertAttendance("in")}>
                <Clock3 className="mr-2 h-4 w-4" /> Clock In
              </Button>
              <Button variant="outline" className="h-10 px-4 rounded-xl text-sm font-semibold" disabled={busy || !attendance?.check_in_at || !!attendance?.check_out_at} onClick={() => upsertAttendance("out")}>
                <LogOut className="mr-2 h-4 w-4" /> Check Out
              </Button>
                <select
                  className="h-10 rounded-xl border bg-background px-3 text-sm"
                  value={hasAvailableBreakOptions ? selectedBreakMinutes : 0}
                  disabled={busy || onBreak || !hasAvailableBreakOptions}
                  onChange={(e) => setSelectedBreakMinutes(Number(e.target.value))}
                >
                  {hasAvailableBreakOptions ? (
                    availableBreakOptions.map((mins) => (
                      <option key={mins} value={mins}>
                        {mins === 60 ? "1 hour break" : `${mins} min break`}
                      </option>
                    ))
                  ) : (
                    <option value={0} disabled>
                      No break time remaining
                    </option>
                  )}
                </select>
                <Button
                  variant="secondary"
                  className="h-10 px-4 rounded-xl text-sm font-semibold"
                  disabled={busy || !attendance?.check_in_at || !!attendance?.check_out_at || (!onBreak && !hasAvailableBreakOptions)}
                  onClick={() => void toggleBreak()}
                >
                {onBreak ? "End Break" : "Start Break"}
              </Button>
                <p className="w-full text-xs text-slate-600 mt-1">
                  Break limit: 60 min | Used: {totalBreakUsedMinutes} min | Remaining: {remainingBreakMinutes} min
                  {onBreak && activeBreakMinutes ? ` | Active: ${activeBreakProgress}` : ""}
                  {onBreak && activeBreakMinutes ? ` | Left on current break: ${activeBreakRemainingMinutes} min` : ""}
                </p>
              </div>
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Attendance Report (Last 30 Days)</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              hours: { label: "Hours", color: "hsl(var(--primary))" },
            }}
            className="h-[170px] w-full"
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {dashboardCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-6">
              <div className={`w-10 h-10 rounded-xl ${card.bg} ${card.color} flex items-center justify-center mb-4`}>
                <card.icon className="h-5 w-5" />
              </div>
              <p className="text-4xl font-bold">{card.value}</p>
              <p className="text-base text-muted-foreground mt-1">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

    </div>
  );
}

