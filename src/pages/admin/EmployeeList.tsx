import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserPlus, Search, Loader2, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Mail, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { filterEmployeeProfiles, normalizeDocumentRecord, normalizeProfileRecord, type DocumentRecord, type ProfileRecord } from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeout, withTimeoutFallback } from "@/lib/async";
import { absoluteAppUrl } from "@/lib/basePath";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { usePortalSearch } from "@/contexts/PortalSearchContext";

interface Employee extends ProfileRecord {
  id?: string;
  user_id?: string;
}

type SortKey = "name" | "email" | "status" | "created_at" | "position";
type SortDir = "asc" | "desc";
type AttendanceRange = "daily" | "weekly" | "monthly";

const PAGE_SIZE = 10;

export default function EmployeeList() {
  const { toast } = useToast();
  const { searchTerm } = usePortalSearch();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePosition, setInvitePosition] = useState("");
  const [inviteEmploymentType, setInviteEmploymentType] = useState<"full_time" | "part_time">("full_time");
  const [inviteWorkingHours, setInviteWorkingHours] = useState("6");
  const [inviting, setInviting] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "invited">("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeDocs, setEmployeeDocs] = useState<DocumentRecord[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<Array<{ work_date: string; check_in_at: string | null; check_out_at: string | null }>>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [attendanceRange, setAttendanceRange] = useState<AttendanceRange>("monthly");

  const fetchEmployees = async () => {
    try {
      const [{ data: profileRows, error: profilesError }, { data: roleRows, error: rolesError }] = await withTimeoutFallback(
        Promise.all([
          supabase.from("employee_profiles").select("*").order("created_at", { ascending: false }),
          supabase.from("user_roles").select("user_id, role"),
        ]),
        [
          { data: [], error: null },
          { data: [], error: null },
        ] as any,
        SUPABASE_REQUEST_TIMEOUT_MS,
      );

      if (profilesError) throw profilesError;
      if (rolesError) throw rolesError;

      const normalizedProfiles = ((profileRows as any[]) ?? []).map((profile) => normalizeProfileRecord(profile));
      setEmployees(filterEmployeeProfiles(normalizedProfiles, roleRows ?? []));
    } catch (err) {
      console.error("Failed to fetch employees:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const resetInviteForm = () => {
    setInviteEmail("");
    setInviteName("");
    setInvitePosition("");
    setInviteEmploymentType("full_time");
    setInviteWorkingHours("6");
  };

  const getFunctionAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Your session has expired. Sign in again and retry.");
    }

    return {
      Authorization: `Bearer ${session.access_token}`,
    };
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteEmploymentType === "part_time") {
      const parsedWorkingHours = Number(inviteWorkingHours);
      if (!Number.isFinite(parsedWorkingHours) || parsedWorkingHours < 1 || parsedWorkingHours > 12) {
        toast({
          title: "Invalid working hours",
          description: "Part-time employees must have working hours between 1 and 12.",
          variant: "destructive",
        });
        return;
      }
    }
    setInviting(true);
    try {
      const headers = await getFunctionAuthHeaders();
      const { data, error } = await withTimeout(
        supabase.functions.invoke("invite-employee", {
          headers,
          body: {
            email: inviteEmail.trim(),
            name: inviteName.trim(),
            position: invitePosition.trim(),
            employment_type: inviteEmploymentType,
            working_hours: inviteEmploymentType === "part_time" ? Number(inviteWorkingHours) : null,
            redirectTo: absoluteAppUrl("/set-password"),
          },
        }),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Employee invitation",
      );

      if (error) {
        let details = error.message;
        const context = (error as any)?.context;
        if (context) {
          try {
            const json = await context.json();
            details = json?.error || json?.message || JSON.stringify(json);
          } catch {
            try {
              const text = await context.text();
              if (text) details = text;
            } catch {
              // no-op: keep original error message
            }
          }
        }
        throw new Error(details || error.message);
      }
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Invitation sent",
        description: `An invitation email has been sent to ${inviteEmail.trim()}.`,
      });
      setDialogOpen(false);
      resetInviteForm();
      fetchEmployees();
    } catch (err: any) {
      toast({ title: "Invitation failed", description: err.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }

    setPage(1);
  };

  const handleDeleteStep1Confirm = () => {
    setDeleteStep(2);
  };

  const handleDeleteFinalConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const targetUserId = deleteTarget.user_id || null;
      const targetProfileId = deleteTarget.id || null;
      const targetEmail = deleteTarget.email || null;
      if (!targetUserId && !targetProfileId && !targetEmail) {
        throw new Error("Missing employee identifier for deletion.");
      }

      const headers = await getFunctionAuthHeaders();
      const { data, error } = await withTimeout(
        supabase.functions.invoke("delete-employee", {
          headers,
          body: {
            user_id: targetUserId,
            profile_id: targetProfileId,
            email: targetEmail,
          },
        }),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Employee deletion",
      );

      if (error) {
        const details = (error as any)?.context?.json ? JSON.stringify((error as any).context.json) : error.message;
        throw new Error(details || error.message);
      }
      if (data?.fallback) throw new Error(data.error || "Employee deletion failed.");
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Employee deleted",
        description: `${deleteTarget.name || deleteTarget.email} has been permanently removed.`,
      });
      setDeleteTarget(null);
      setDeleteStep(1);
      setDeleteConfirmInput("");
      fetchEmployees();
    } catch (err: any) {
      toast({ title: "Error deleting employee", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
    setDeleteStep(1);
    setDeleteConfirmInput("");
  };

  const loadEmployeeProfileData = async (employee: Employee, range: AttendanceRange = attendanceRange) => {
    if (!employee.user_id) {
      setSelectedEmployee(employee);
      setEmployeeDocs([]);
      setAttendanceRows([]);
      return;
    }

    setProfileLoading(true);
    setSelectedEmployee(employee);
    try {
      const toDate = new Date();
      const fromDate = new Date();
      if (range === "daily") fromDate.setDate(fromDate.getDate() - 1);
      if (range === "weekly") fromDate.setDate(fromDate.getDate() - 6);
      if (range === "monthly") fromDate.setDate(fromDate.getDate() - 29);
      const from = fromDate.toISOString().slice(0, 10);
      const to = toDate.toISOString().slice(0, 10);

      const [{ data: docs, error: docsError }, { data: attendance, error: attendanceError }] = await withTimeoutFallback(
        Promise.all([
          supabase.from("documents").select("*").eq("user_id", employee.user_id).order("uploaded_at", { ascending: false }),
          supabase
            .from("attendance_entries")
            .select("work_date,check_in_at,check_out_at")
            .eq("user_id", employee.user_id)
            .gte("work_date", from)
            .lte("work_date", to)
            .order("work_date", { ascending: true }),
        ]),
        [{ data: [], error: null }, { data: [], error: null }] as any,
        SUPABASE_REQUEST_TIMEOUT_MS,
      );

      if (docsError) throw docsError;
      if (attendanceError) throw attendanceError;

      setEmployeeDocs(((docs as any[]) ?? []).map((doc) => normalizeDocumentRecord(doc)));
      setAttendanceRows((attendance as Array<{ work_date: string; check_in_at: string | null; check_out_at: string | null }>) ?? []);
    } catch (err: any) {
      toast({ title: "Failed to load profile", description: err.message, variant: "destructive" });
      setEmployeeDocs([]);
      setAttendanceRows([]);
    } finally {
      setProfileLoading(false);
    }
  };

  const downloadDocument = async (doc: DocumentRecord) => {
    if (!doc.storage_path) {
      toast({ title: "Download unavailable", description: "Storage path is missing for this file.", variant: "destructive" });
      return;
    }
    const { data, error } = await withTimeout(
      supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60),
      SUPABASE_REQUEST_TIMEOUT_MS,
      "Document download",
    );
    if (error) {
      toast({ title: "Download failed", description: error.message, variant: "destructive" });
      return;
    }
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const attendanceChartData = useMemo(() => {
    const pointsCount = attendanceRange === "daily" ? 2 : attendanceRange === "weekly" ? 7 : 30;
    const map = new Map(attendanceRows.map((row) => [row.work_date, row]));
    const end = new Date();
    const points: Array<{ date: string; hours: number }> = [];
    for (let i = pointsCount - 1; i >= 0; i--) {
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
  }, [attendanceRows, attendanceRange]);

  useEffect(() => {
    if (!profileOpen || !selectedEmployee) return;
    loadEmployeeProfileData(selectedEmployee, attendanceRange);
  }, [attendanceRange]);

  const processed = useMemo(() => {
    let list = [...employees];
    const effectiveSearch = (searchTerm || search).trim().toLowerCase();
    if (effectiveSearch) {
      const query = effectiveSearch;
      list = list.filter((employee) => employee.name.toLowerCase().includes(query) || employee.email.toLowerCase().includes(query));
    }

    if (filter !== "all") {
      list = list.filter((employee) => employee.status === filter);
    }

    list = [...list].sort((a, b) => {
      const aValue = (a[sortKey] ?? "").toString().toLowerCase();
      const bValue = (b[sortKey] ?? "").toString().toLowerCase();
      return sortDir === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    });

    return list;
  }, [employees, filter, search, sortDir, sortKey]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const paged = processed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const nonAdminCount = employees.length;

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "status-badge-active",
      inactive: "status-badge-inactive",
      invited: "status-badge-pending",
    };

    return <span className={map[status] || "status-badge-inactive"}>{status}</span>;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-muted-foreground">{nonAdminCount} total employees</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetInviteForm(); }}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 h-4 w-4" /> Add Employee</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite New Employee</DialogTitle>
              <DialogDescription>
                Send an email invitation that lets the employee set their password and activate their portal account.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} required placeholder="John Doe" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required placeholder="john@microtech.com" />
              </div>
              <div className="space-y-2">
                <Label>Position</Label>
                <Input value={invitePosition} onChange={(e) => setInvitePosition(e.target.value)} required placeholder="Software Engineer" />
              </div>
              <div className="space-y-2">
                <Label>Employment Type</Label>
                <Select value={inviteEmploymentType} onValueChange={(value: "full_time" | "part_time") => setInviteEmploymentType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full Time</SelectItem>
                    <SelectItem value="part_time">Part Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {inviteEmploymentType === "part_time" && (
                <div className="space-y-2">
                  <Label>Working Hours</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    step="0.5"
                    value={inviteWorkingHours}
                    onChange={(e) => setInviteWorkingHours(e.target.value)}
                    required
                    placeholder="e.g. 6"
                  />
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={inviting}>
                  {inviting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Mail className="mr-2 h-4 w-4" />}
                  {inviting ? "Sending..." : "Send Invitation"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="wf-panel">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employees..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex gap-2">
              {(["all", "active", "inactive", "invited"] as const).map((value) => (
                <Button key={value} variant="outline" size="sm" onClick={() => { setFilter(value); setPage(1); }} className={`capitalize ${filter === value ? "wf-filter-btn-active" : "wf-filter-btn"}`}>
                  {value}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader className="wf-table-head">
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("name")}>Name <SortIcon col="name" /></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("email")}>Email <SortIcon col="email" /></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("position")}>Position <SortIcon col="position" /></TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("status")}>Status <SortIcon col="status" /></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("created_at")}>Joined <SortIcon col="created_at" /></TableHead>
                <TableHead>View</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <Loader2 className="animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No employees found
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((employee) => (
                    <TableRow key={employee.id ?? employee.user_id ?? employee.email}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {employee.avatar_url ? (
                          <img src={employee.avatar_url} alt={employee.name || employee.email} className="h-8 w-8 rounded-full object-cover border" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold border">
                            {(employee.name || employee.email || "E").trim().charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span>{employee.name || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{employee.email || "-"}</TableCell>
                    <TableCell>{employee.position || "-"}</TableCell>
                    <TableCell>{employee.phone || "-"}</TableCell>
                    <TableCell>{statusBadge(employee.status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {employee.created_at ? new Date(employee.created_at).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setProfileOpen(true);
                          setAttendanceRange("monthly");
                          loadEmployeeProfileData(employee);
                        }}
                      >
                        View Profile
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setDeleteTarget(employee);
                          setDeleteStep(1);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, processed.length)} of {processed.length}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => (
                  <Button key={value} variant={page === value ? "default" : "outline"} size="sm" onClick={() => setPage(value)} className="w-8">
                    {value}
                  </Button>
                ))}
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Employee Profile</DialogTitle>
            <DialogDescription>
              Full employee details, attached documents, and recent attendance report.
            </DialogDescription>
          </DialogHeader>
          {profileLoading ? (
            <div className="py-10">
              <Loader2 className="animate-spin mx-auto" />
            </div>
          ) : !selectedEmployee ? (
            <p className="text-sm text-muted-foreground">No employee selected.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{selectedEmployee.name || "-"}</span></div>
                      <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{selectedEmployee.email || "-"}</span></div>
                      <div><span className="text-muted-foreground">Phone:</span> <span>{selectedEmployee.phone || "-"}</span></div>
                      <div><span className="text-muted-foreground">Position:</span> <span>{selectedEmployee.position || "-"}</span></div>
                      <div>
                        <span className="text-muted-foreground">Employment:</span>{" "}
                        <span>{selectedEmployee.employment_type === "part_time" ? "Part Time" : "Full Time"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Shift Hours:</span>{" "}
                        <span>{selectedEmployee.employment_type === "part_time" ? `${selectedEmployee.working_hours ?? "-"}h` : "9h (incl. break)"}</span>
                      </div>
                      <div><span className="text-muted-foreground">Gender:</span> <span className="capitalize">{selectedEmployee.gender || "-"}</span></div>
                      <div><span className="text-muted-foreground">ID / Passport:</span> <span>{selectedEmployee.id_passport || "-"}</span></div>
                      <div><span className="text-muted-foreground">Status:</span> <span className="capitalize">{selectedEmployee.status || "-"}</span></div>
                      <div><span className="text-muted-foreground">Joined:</span> <span>{selectedEmployee.created_at ? new Date(selectedEmployee.created_at).toLocaleDateString() : "-"}</span></div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <p className="font-medium">Attached Documents</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {employeeDocs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No documents attached.</p>
                    ) : (
                      employeeDocs.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between border rounded-md p-2">
                          <div>
                            <p className="text-sm font-medium">{doc.file_name || "Untitled"}</p>
                            <p className="text-xs text-muted-foreground">{doc.category} · {new Date(doc.uploaded_at).toLocaleDateString()}</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => downloadDocument(doc)}>View</Button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">
                      Attendance Report ({attendanceRange === "daily" ? "Daily" : attendanceRange === "weekly" ? "Weekly" : "Monthly"})
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant={attendanceRange === "daily" ? "default" : "outline"} onClick={() => setAttendanceRange("daily")}>Daily</Button>
                      <Button size="sm" variant={attendanceRange === "weekly" ? "default" : "outline"} onClick={() => setAttendanceRange("weekly")}>Weekly</Button>
                      <Button size="sm" variant={attendanceRange === "monthly" ? "default" : "outline"} onClick={() => setAttendanceRange("monthly")}>Monthly</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      hours: {
                        label: "Hours",
                        color: "hsl(var(--primary))",
                      },
                    }}
                    className="h-[320px] w-full"
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
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) handleDeleteCancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className={deleteStep === 2 ? "text-destructive" : ""}>
              {deleteStep === 1 ? "Delete Employee" : "Final Confirmation"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteStep === 1 ? (
                <>
                  Are you sure you want to delete <strong>{deleteTarget?.name || deleteTarget?.email}</strong>? This will remove their profile, documents, leave requests, and account access.
                </>
              ) : (
                <>
                  This action is <strong>permanent and cannot be undone</strong>. All data for <strong>{deleteTarget?.name || deleteTarget?.email}</strong> will be permanently deleted. Are you absolutely sure?
                </>
              )}
            </AlertDialogDescription>
            {deleteStep === 2 && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="delete-confirm-input">Type <strong>DELETE</strong> to confirm</Label>
                <Input
                  id="delete-confirm-input"
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  placeholder="DELETE"
                />
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>Cancel</AlertDialogCancel>
            {deleteStep === 1 ? (
              <Button type="button" onClick={handleDeleteStep1Confirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Yes, Continue
              </Button>
            ) : (
              <Button type="button" onClick={handleDeleteFinalConfirm} disabled={deleting || deleteConfirmInput.trim() !== "DELETE"} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                Delete Permanently
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

