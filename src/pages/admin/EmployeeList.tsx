import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AlertDialogAction,
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
import { filterEmployeeProfiles, normalizeProfileRecord, type ProfileRecord } from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeout, withTimeoutFallback } from "@/lib/async";

interface Employee extends ProfileRecord {
  id?: string;
  user_id?: string;
}

type SortKey = "name" | "email" | "status" | "created_at" | "position";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

export default function EmployeeList() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePosition, setInvitePosition] = useState("");
  const [inviting, setInviting] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "invited">("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleting, setDeleting] = useState(false);

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
            redirectTo: `${window.location.origin}/set-password`,
          },
        }),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Employee invitation",
      );

      if (error) throw error;
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
    if (!deleteTarget?.user_id) return;
    setDeleting(true);
    try {
      const headers = await getFunctionAuthHeaders();
      const { data, error } = await withTimeout(
        supabase.functions.invoke("delete-employee", {
          headers,
          body: { user_id: deleteTarget.user_id },
        }),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Employee deletion",
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Employee deleted",
        description: `${deleteTarget.name || deleteTarget.email} has been permanently removed.`,
      });
      setDeleteTarget(null);
      setDeleteStep(1);
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
  };

  const processed = useMemo(() => {
    let list = [...employees];
    if (search) {
      const query = search.toLowerCase();
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
    <div className="space-y-6 animate-fade-in">
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

      <Card>
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
                <Button key={value} variant={filter === value ? "default" : "outline"} size="sm" onClick={() => { setFilter(value); setPage(1); }} className="capitalize">
                  {value}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("name")}>Name <SortIcon col="name" /></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("email")}>Email <SortIcon col="email" /></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("position")}>Position <SortIcon col="position" /></TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("status")}>Status <SortIcon col="status" /></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("created_at")}>Joined <SortIcon col="created_at" /></TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No employees found
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((employee) => (
                  <TableRow key={employee.id ?? employee.user_id ?? employee.email}>
                    <TableCell className="font-medium">{employee.name || "—"}</TableCell>
                    <TableCell>{employee.email || "—"}</TableCell>
                    <TableCell>{employee.position || "—"}</TableCell>
                    <TableCell>{employee.phone || "—"}</TableCell>
                    <TableCell>{statusBadge(employee.status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {employee.created_at ? new Date(employee.created_at).toLocaleDateString() : "—"}
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
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, processed.length)} of {processed.length}
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

      <AlertDialog open={!!deleteTarget && deleteStep === 1} onOpenChange={(open) => { if (!open) handleDeleteCancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name || deleteTarget?.email}</strong>? This will remove their profile, documents, leave requests, and account access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStep1Confirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget && deleteStep === 2} onOpenChange={(open) => { if (!open) handleDeleteCancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Final Confirmation</AlertDialogTitle>
            <AlertDialogDescription>
              This action is <strong>permanent and cannot be undone</strong>. All data for <strong>{deleteTarget?.name || deleteTarget?.email}</strong> will be permanently deleted. Are you absolutely sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFinalConfirm} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
