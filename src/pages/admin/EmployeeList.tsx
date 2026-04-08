import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
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
import { UserPlus, Search, Loader2, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Copy, CheckCircle2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Employee {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  position: string | null;
  profile_completed: boolean | null;
  created_at: string;
}

type SortKey = "name" | "email" | "status" | "created_at" | "position";
type SortDir = "asc" | "desc";
const PAGE_SIZE = 10;

export default function EmployeeList() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePosition, setInvitePosition] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "invited">("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState(false);

  // Delete state - two-step confirmation
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleting, setDeleting] = useState(false);

  const fetchEmployees = async () => {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("employee_profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role").eq("role", "admin" as any),
    ]);
    const adminIds = new Set((roles ?? []).map((r) => r.user_id));
    setAdminUserIds(adminIds);
    setEmployees(profiles ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { error: invError } = await supabase.from("invitations").insert({
        email: inviteEmail,
        token,
        expires_at: expiresAt,
        name: inviteName,
        position: invitePosition,
      } as any);
      if (invError) throw invError;

      const link = `${window.location.origin}/set-password?token=${token}`;
      setInviteLink(link);

      toast({ title: "Invitation created", description: "Share the link below with the employee." });
      fetchEmployees();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast({ title: "Link copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setInviteEmail("");
      setInviteName("");
      setInvitePosition("");
      setInviteLink("");
      setCopied(false);
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

  const handleDeleteClick = (emp: Employee) => {
    setDeleteTarget(emp);
    setDeleteStep(1);
  };

  const handleDeleteStep1Confirm = () => {
    setDeleteStep(2);
  };

  const handleDeleteFinalConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-employee", {
        body: { user_id: deleteTarget.user_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Employee deleted", description: `${deleteTarget.name || deleteTarget.email} has been permanently removed.` });
      setDeleteTarget(null);
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

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />;
  };

  const processed = useMemo(() => {
    let list = employees.filter((e) => !adminUserIds.has(e.user_id));
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(s) || e.email.toLowerCase().includes(s));
    }
    if (filter !== "all") list = list.filter((e) => e.status === filter);
    list = [...list].sort((a, b) => {
      const aVal = ((a as any)[sortKey] ?? "").toString().toLowerCase();
      const bVal = ((b as any)[sortKey] ?? "").toString().toLowerCase();
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return list;
  }, [employees, adminUserIds, search, filter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const paged = processed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const nonAdminCount = employees.filter((e) => !adminUserIds.has(e.user_id)).length;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { active: "status-badge-active", inactive: "status-badge-inactive", invited: "status-badge-pending" };
    return <span className={map[status] || "status-badge-inactive"}>{status}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-muted-foreground">{nonAdminCount} total employees</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 h-4 w-4" /> Add Employee</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite New Employee</DialogTitle></DialogHeader>
            {!inviteLink ? (
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
                <Button type="submit" className="w-full" disabled={inviting}>
                  {inviting && <Loader2 className="animate-spin mr-2" />} Generate Invitation Link
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted p-4 space-y-2">
                  <p className="text-sm font-medium">Invitation link generated!</p>
                  <p className="text-xs text-muted-foreground">Share this link with <strong>{inviteName}</strong> ({inviteEmail}). It expires in 7 days.</p>
                  <div className="flex gap-2 mt-2">
                    <Input value={inviteLink} readOnly className="text-xs" />
                    <Button variant="outline" size="sm" onClick={handleCopyLink}>
                      {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={() => handleCloseDialog(false)}>Done</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search employees..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <div className="flex gap-2">
              {(["all", "active", "inactive", "invited"] as const).map((f) => (
                <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => { setFilter(f); setPage(1); }} className="capitalize">{f}</Button>
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
                <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
              ) : paged.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No employees found</TableCell></TableRow>
              ) : (
                paged.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.name || "—"}</TableCell>
                    <TableCell>{emp.email}</TableCell>
                    <TableCell>{(emp as any).position || "—"}</TableCell>
                    <TableCell>{emp.phone || "—"}</TableCell>
                    <TableCell>{statusBadge(emp.status)}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(emp.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteClick(emp)}>
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
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Button key={p} variant={page === p ? "default" : "outline"} size="sm" onClick={() => setPage(p)} className="w-8">{p}</Button>
                ))}
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 1: First confirmation */}
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

      {/* Step 2: Final confirmation */}
      <AlertDialog open={!!deleteTarget && deleteStep === 2} onOpenChange={(open) => { if (!open) handleDeleteCancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Final Confirmation</AlertDialogTitle>
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
