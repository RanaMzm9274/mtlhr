import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EmployeeRow {
  user_id: string;
  name: string;
  email: string;
}

interface AttendanceRow {
  id: string;
  user_id: string;
  work_date: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  break_minutes: number | null;
  break_started_at: string | null;
  break_selected_minutes: number | null;
}

const today = () => new Date().toISOString().slice(0, 10);
type ReportPreset = "weekly" | "monthly" | "quarterly" | "custom";

export default function AdminAttendance() {
  const { companySlug } = useAuth();
  const { toast } = useToast();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [date] = useState(today());
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [attendance, setAttendance] = useState<Map<string, AttendanceRow>>(new Map());
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkEmployee, setBulkEmployee] = useState<EmployeeRow | null>(null);
  const [bulkFromDate, setBulkFromDate] = useState(today());
  const [bulkToDate, setBulkToDate] = useState(today());
  const [bulkCheckinTime, setBulkCheckinTime] = useState("09:00");
  const [bulkCheckoutTime, setBulkCheckoutTime] = useState("18:00");
  const [skipSaturday, setSkipSaturday] = useState(false);
  const [skipSunday, setSkipSunday] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [reportEmployeeId, setReportEmployeeId] = useState<string>("");
  const [reportPreset, setReportPreset] = useState<ReportPreset>("weekly");
  const [customFromDate, setCustomFromDate] = useState(today());
  const [customToDate, setCustomToDate] = useState(today());
  const [reportRows, setReportRows] = useState<AttendanceRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [breakColumnsSupported, setBreakColumnsSupported] = useState(true);

  const normalizeAttendanceRows = (rows: any[] = []) =>
    rows.map((row) => ({
      ...row,
      break_minutes: typeof row?.break_minutes === "number" ? row.break_minutes : 0,
      break_started_at: row?.break_started_at ?? null,
      break_selected_minutes: typeof row?.break_selected_minutes === "number" ? row.break_selected_minutes : null,
    })) as AttendanceRow[];

  const isMissingBreakColumnsError = (message?: string) =>
    !!message && (message.includes("break_minutes") || message.includes("break_started_at") || message.includes("break_selected_minutes"));

  useEffect(() => {
    if (!companySlug) return;
    supabase.from("companies").select("id").eq("slug", companySlug).maybeSingle().then(({ data }) => setCompanyId(data?.id ?? null));
  }, [companySlug]);

  const fetchData = async () => {
    if (!companyId) return;
    const [{ data: empRows }, { data: attRows, error: attError }] = await Promise.all([
      supabase.from("employee_profiles").select("user_id,name,email").eq("company_id", companyId).order("name", { ascending: true }),
      supabase.from("attendance_entries").select("id,user_id,work_date,scheduled_start,scheduled_end,check_in_at,check_out_at,break_minutes,break_started_at,break_selected_minutes").eq("company_id", companyId).eq("work_date", date),
    ]);

    let normalizedAttendance = normalizeAttendanceRows((attRows as any[]) ?? []);
    if (attError && isMissingBreakColumnsError(attError.message)) {
      const { data: fallbackRows, error: fallbackError } = await supabase
        .from("attendance_entries")
        .select("id,user_id,work_date,scheduled_start,scheduled_end,check_in_at,check_out_at")
        .eq("company_id", companyId)
        .eq("work_date", date);
      if (!fallbackError) {
        setBreakColumnsSupported(false);
        normalizedAttendance = normalizeAttendanceRows((fallbackRows as any[]) ?? []);
      }
    }

    setEmployees((empRows as EmployeeRow[]) ?? []);
    const map = new Map<string, AttendanceRow>();
    normalizedAttendance.forEach((row) => map.set(row.user_id, row));
    setAttendance(map);
  };

  useEffect(() => {
    fetchData();
  }, [companyId, date]);

  useEffect(() => {
    if (!reportEmployeeId && employees.length > 0) {
      setReportEmployeeId(employees[0].user_id);
    }
    if (!selectedEmployeeId && employees.length > 0) {
      setSelectedEmployeeId(employees[0].user_id);
    }
  }, [employees, reportEmployeeId, selectedEmployeeId]);

  const updateEntry = async (userId: string, patch: Partial<AttendanceRow>) => {
    if (!companyId) return;
    setSaving(userId);
    const existing = attendance.get(userId);
    const payload = {
      company_id: companyId,
      user_id: userId,
      work_date: date,
      scheduled_start: patch.scheduled_start ?? existing?.scheduled_start ?? null,
      scheduled_end: patch.scheduled_end ?? existing?.scheduled_end ?? null,
      check_in_at: patch.check_in_at ?? existing?.check_in_at ?? null,
      check_out_at: patch.check_out_at ?? existing?.check_out_at ?? null,
      updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      ...(breakColumnsSupported
        ? {
            break_minutes: existing?.break_minutes ?? 0,
            break_started_at: existing?.break_started_at ?? null,
            break_selected_minutes: existing?.break_selected_minutes ?? null,
          }
        : {}),
    };

    const { error } = await supabase.from("attendance_entries").upsert(payload, { onConflict: "company_id,user_id,work_date" });
    setSaving(null);

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }

    fetchData();
  };

  const openBulkDialog = (employee: EmployeeRow) => {
    setBulkEmployee(employee);
    setBulkFromDate(today());
    setBulkToDate(today());
    setBulkCheckinTime("09:00");
    setBulkCheckoutTime(new Date().toTimeString().slice(0, 5));
    setSkipSaturday(false);
    setSkipSunday(false);
    setBulkDialogOpen(true);
  };

  const getDateRange = (fromDate: string, toDate: string) => {
    const range: string[] = [];
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T00:00:00`);
    while (start <= end) {
      range.push(start.toISOString().slice(0, 10));
      start.setDate(start.getDate() + 1);
    }
    return range;
  };

  const getReportRange = (preset: ReportPreset) => {
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    const startDate = new Date(now);
    if (preset === "weekly") startDate.setDate(startDate.getDate() - 6);
    if (preset === "monthly") startDate.setDate(startDate.getDate() - 29);
    if (preset === "quarterly") startDate.setDate(startDate.getDate() - 89);
    if (preset === "custom") {
      return { from: customFromDate, to: customToDate };
    }
    return { from: startDate.toISOString().slice(0, 10), to: end };
  };

  const handleBulkAttendanceUpdate = async () => {
    if (!companyId || !bulkEmployee) return;
    if (bulkFromDate > bulkToDate) {
      toast({ title: "Invalid range", description: "From date must be earlier than or equal to To date.", variant: "destructive" });
      return;
    }
    if (bulkToDate > today()) {
      toast({ title: "Invalid range", description: "You can only update attendance for past or present dates.", variant: "destructive" });
      return;
    }

    setBulkSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const now = new Date();
    const workDates = getDateRange(bulkFromDate, bulkToDate).filter((workDate) => {
      const day = new Date(`${workDate}T00:00:00`).getDay();
      if (skipSaturday && day === 6) return false;
      if (skipSunday && day === 0) return false;
      return true;
    });

    if (workDates.length === 0) {
      setBulkSaving(false);
      toast({ title: "No dates to update", description: "All dates in this range are skipped by selected weekend options.", variant: "destructive" });
      return;
    }

    const payload = workDates.map((workDate) => {
      const requestedCheckin = new Date(`${workDate}T${bulkCheckinTime}:00`);
      const requested = new Date(`${workDate}T${bulkCheckoutTime}:00`);
      const checkinAt = requestedCheckin > now ? now : requestedCheckin;
      const checkoutAt = requested > now ? now : requested;
      return {
        company_id: companyId,
        user_id: bulkEmployee.user_id,
        work_date: workDate,
        check_in_at: checkinAt.toISOString(),
        check_out_at: checkoutAt.toISOString(),
        updated_by: userId,
      };
    });

    const { error } = await supabase.from("attendance_entries").upsert(payload, { onConflict: "company_id,user_id,work_date" });
    setBulkSaving(false);

    if (error) {
      toast({ title: "Bulk update failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Attendance updated", description: `Updated ${bulkEmployee.name || bulkEmployee.email} from ${bulkFromDate} to ${bulkToDate}.` });
    setBulkDialogOpen(false);
    fetchData();
  };

  const fetchReport = async () => {
    if (!companyId || !reportEmployeeId) return;
    const range = getReportRange(reportPreset);
    if (range.from > range.to) {
      toast({ title: "Invalid custom range", description: "From date must be earlier than or equal to To date.", variant: "destructive" });
      return;
    }
    if (range.to > today()) {
      toast({ title: "Invalid custom range", description: "Report end date cannot be in the future.", variant: "destructive" });
      return;
    }
    setReportLoading(true);
    const { data, error } = await supabase
      .from("attendance_entries")
      .select("id,user_id,work_date,scheduled_start,scheduled_end,check_in_at,check_out_at,break_minutes,break_started_at,break_selected_minutes")
      .eq("company_id", companyId)
      .eq("user_id", reportEmployeeId)
      .gte("work_date", range.from)
      .lte("work_date", range.to)
      .order("work_date", { ascending: false });

    if (error && isMissingBreakColumnsError(error.message)) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("attendance_entries")
        .select("id,user_id,work_date,scheduled_start,scheduled_end,check_in_at,check_out_at")
        .eq("company_id", companyId)
        .eq("user_id", reportEmployeeId)
        .gte("work_date", range.from)
        .lte("work_date", range.to)
        .order("work_date", { ascending: false });
      setReportLoading(false);
      if (fallbackError) {
        toast({ title: "Report failed", description: fallbackError.message, variant: "destructive" });
        return;
      }
      setBreakColumnsSupported(false);
      setReportRows(normalizeAttendanceRows((fallbackData as any[]) ?? []));
      return;
    }

    setReportLoading(false);
    if (error) {
      toast({ title: "Report failed", description: error.message, variant: "destructive" });
      return;
    }
    setReportRows(normalizeAttendanceRows((data as any[]) ?? []));
  };

  useEffect(() => {
    fetchReport();
  }, [companyId, reportEmployeeId, reportPreset]);

  const reportSummary = useMemo(() => {
    const range = getReportRange(reportPreset);
    const totalDays = getDateRange(range.from, range.to).length;
    const presentDays = reportRows.filter((row) => row.check_in_at || row.check_out_at).length;
    const completeDays = reportRows.filter((row) => row.check_in_at && row.check_out_at).length;
    const totalHours = reportRows.reduce((sum, row) => {
      if (!row.check_in_at || !row.check_out_at) return sum;
      const diff = new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime();
      return diff > 0 ? sum + diff / 3600000 : sum;
    }, 0);
    return {
      totalDays,
      presentDays,
      absentDays: Math.max(totalDays - presentDays, 0),
      completeDays,
      totalHours: totalHours.toFixed(1),
    };
  }, [reportRows, reportPreset, customFromDate, customToDate]);

  const reportChartData = useMemo(() => {
    return [...reportRows]
      .sort((a, b) => a.work_date.localeCompare(b.work_date))
      .map((row) => {
        let hours = 0;
        if (row.check_in_at && row.check_out_at) {
          const diff = new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime();
          if (diff > 0) hours = Number((diff / 3600000).toFixed(2));
        }
        return { date: row.work_date.slice(5), hours };
      });
  }, [reportRows]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.user_id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  );
  const selectedEntry = useMemo(
    () => (selectedEmployee ? attendance.get(selectedEmployee.user_id) : undefined),
    [attendance, selectedEmployee],
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-muted-foreground">Manage employee schedules and check-in/out with a selected employee.</p>
      </div>

      <Card className="wf-panel">
        <CardHeader>
          <CardTitle>Employee Attendance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-md">
            <p className="text-sm font-medium mb-2">Select Employee</p>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
            >
              {employees.map((employee) => (
                <option key={employee.user_id} value={employee.user_id}>
                  {employee.name || employee.email}
                </option>
              ))}
            </select>
          </div>

          {selectedEmployee ? (
            <div className="border rounded-lg p-3 space-y-2">
              <p className="font-medium">{selectedEmployee.name || selectedEmployee.email}</p>
              <p className="text-xs text-muted-foreground">{selectedEmployee.email}</p>
              <div className="grid md:grid-cols-2 gap-2">
                <Input
                  type="time"
                  defaultValue={selectedEntry?.scheduled_start ?? ""}
                  onBlur={(e) => updateEntry(selectedEmployee.user_id, { scheduled_start: e.target.value || null })}
                />
                <Input
                  type="time"
                  defaultValue={selectedEntry?.scheduled_end ?? ""}
                  onBlur={(e) => updateEntry(selectedEmployee.user_id, { scheduled_end: e.target.value || null })}
                />
              </div>
              <div>
                <Button variant="outline" size="sm" onClick={() => openBulkDialog(selectedEmployee)}>Update Attendance</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                In: {selectedEntry?.check_in_at ? new Date(selectedEntry.check_in_at).toLocaleString() : "-"} | Out: {selectedEntry?.check_out_at ? new Date(selectedEntry.check_out_at).toLocaleString() : "-"}
                {saving === selectedEmployee.user_id ? " | Saving..." : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No employees found.</p>
          )}
        </CardContent>
      </Card>

      <Card className="wf-panel">
        <CardHeader>
          <CardTitle>Attendance Reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-4 gap-2">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={reportEmployeeId}
              onChange={(e) => setReportEmployeeId(e.target.value)}
            >
              {employees.map((employee) => (
                <option key={employee.user_id} value={employee.user_id}>
                  {employee.name || employee.email}
                </option>
              ))}
            </select>
            <Button variant="outline" className={reportPreset === "weekly" ? "wf-filter-btn-active" : "wf-filter-btn"} onClick={() => setReportPreset("weekly")}>Weekly</Button>
            <Button variant="outline" className={reportPreset === "monthly" ? "wf-filter-btn-active" : "wf-filter-btn"} onClick={() => setReportPreset("monthly")}>Monthly</Button>
            <Button variant="outline" className={reportPreset === "quarterly" ? "wf-filter-btn-active" : "wf-filter-btn"} onClick={() => setReportPreset("quarterly")}>3 Months</Button>
          </div>

          <div className="grid md:grid-cols-4 gap-2 items-end">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Custom from</p>
              <Input type="date" max={today()} value={customFromDate} onChange={(e) => setCustomFromDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Custom to</p>
              <Input type="date" max={today()} value={customToDate} onChange={(e) => setCustomToDate(e.target.value)} />
            </div>
            <Button variant="outline" className={reportPreset === "custom" ? "wf-filter-btn-active" : "wf-filter-btn"} onClick={() => setReportPreset("custom")}>Use Custom</Button>
            <Button onClick={fetchReport} disabled={reportLoading}>{reportLoading ? "Loading..." : "Refresh Report"}</Button>
          </div>

            <div className="grid md:grid-cols-6 gap-2 text-sm">
            <div className="border rounded-md p-3">Total Days: <span className="font-semibold">{reportSummary.totalDays}</span></div>
            <div className="border rounded-md p-3">Present: <span className="font-semibold">{reportSummary.presentDays}</span></div>
            <div className="border rounded-md p-3">Absent: <span className="font-semibold">{reportSummary.absentDays}</span></div>
            <div className="border rounded-md p-3">Completed: <span className="font-semibold">{reportSummary.completeDays}</span></div>
              <div className="border rounded-md p-3">Hours: <span className="font-semibold">{reportSummary.totalHours}</span></div>
              <div className="border rounded-md p-3">Break (min): <span className="font-semibold">{reportRows.reduce((s, r) => s + (r.break_minutes ?? 0), 0)}</span></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Check-in</th>
                    <th className="text-left p-2">Check-out</th>
                    <th className="text-left p-2">Break</th>
                    <th className="text-left p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2">{new Date(row.work_date).toLocaleDateString()}</td>
                      <td className="p-2">{row.check_in_at ? new Date(row.check_in_at).toLocaleString() : "-"}</td>
                      <td className="p-2">{row.check_out_at ? new Date(row.check_out_at).toLocaleString() : "-"}</td>
                      <td className="p-2">
                        {(row.break_minutes ?? 0) > 0 ? `${row.break_minutes} min` : "-"}
                        {row.break_started_at ? ` (Active ${row.break_selected_minutes ?? 0}m)` : ""}
                      </td>
                      <td className="p-2">{row.check_in_at || row.check_out_at ? "Present" : "Absent"}</td>
                    </tr>
                  ))}
                  {reportRows.length === 0 && (
                    <tr>
                      <td className="p-3 text-muted-foreground" colSpan={5}>No attendance found for selected range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border rounded-md p-3">
              <p className="text-sm font-medium mb-2">Attendance Hours Chart</p>
              <ChartContainer
                config={{
                  hours: {
                    label: "Hours",
                    color: "hsl(var(--primary))",
                  },
                }}
                className="h-[260px] w-full"
              >
                <LineChart data={reportChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} domain={[0, 12]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line dataKey="hours" type="monotone" stroke="var(--color-hours)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Attendance</DialogTitle>
            <DialogDescription>
              Update check-in and check-out for {bulkEmployee?.name || bulkEmployee?.email} for multiple days. Future dates are not allowed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-sm font-medium">From date</p>
              <Input type="date" value={bulkFromDate} max={today()} onChange={(e) => setBulkFromDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">To date</p>
              <Input type="date" value={bulkToDate} max={today()} onChange={(e) => setBulkToDate(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium">Check-in time</p>
              <Input type="time" value={bulkCheckinTime} onChange={(e) => setBulkCheckinTime(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium">Check-out time</p>
              <Input type="time" value={bulkCheckoutTime} onChange={(e) => setBulkCheckoutTime(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium">Skip days</p>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={skipSaturday} onChange={(e) => setSkipSaturday(e.target.checked)} />
                  Skip Saturday
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={skipSunday} onChange={(e) => setSkipSunday(e.target.checked)} />
                  Skip Sunday
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)} disabled={bulkSaving}>Cancel</Button>
            <Button onClick={handleBulkAttendanceUpdate} disabled={bulkSaving}>
              {bulkSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
