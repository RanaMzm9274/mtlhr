import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { buildDocumentInsertPayload, buildLeaveInsertPayload, normalizeLeaveRecord } from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeout, withTimeoutFallback } from "@/lib/async";

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  admin_comment: string | null;
  created_at: string;
}

export default function EmployeeLeave() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [form, setForm] = useState({
    leave_type: "annual",
    start_date: "",
    end_date: "",
    reason: "",
  });

  const fetchLeaves = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await withTimeoutFallback(
        supabase.from("leave_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        { data: [], error: null } as any,
        SUPABASE_REQUEST_TIMEOUT_MS,
      );
      if (error) throw error;
      setLeaves(((data as any[]) ?? []).map((leave) => normalizeLeaveRecord(leave)));
    } catch (err) {
      console.error("Failed to fetch leave requests:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeaves(); }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (form.end_date < form.start_date) {
      toast({ title: "Invalid dates", description: "End date cannot be earlier than start date.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    let uploadedPath: string | null = null;
    try {
      if (attachment) {
        const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
        if (!allowedTypes.includes(attachment.type)) {
          throw new Error("Invalid attachment type. Only PDF, JPG, PNG allowed.");
        }
        if (attachment.size > 5 * 1024 * 1024) {
          throw new Error("Attachment too large. Max 5MB.");
        }

        const ext = attachment.name.split(".").pop()?.toLowerCase() || "pdf";
        const path = `${user.id}/leave-${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await withTimeout(
          supabase.storage.from("documents").upload(path, attachment),
          SUPABASE_REQUEST_TIMEOUT_MS,
          "Leave attachment upload",
        );
        if (uploadError) throw uploadError;
        uploadedPath = path;

        const docPayload = buildDocumentInsertPayload(user.id, path, attachment, "certificate");
        const { error: docError } = await withTimeout(
          supabase.from("documents").insert(docPayload as any),
          SUPABASE_REQUEST_TIMEOUT_MS,
          "Leave attachment save",
        );
        if (docError) throw docError;
      }

      const payload = buildLeaveInsertPayload(user.id, form);
      const { error } = await withTimeout(
        supabase.from("leave_requests").insert(payload as any),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Leave submission",
      );
      if (error) throw error;
      toast({ title: "Leave request submitted" });
      setDialogOpen(false);
      setForm({ leave_type: "annual", start_date: "", end_date: "", reason: "" });
      setAttachment(null);
      fetchLeaves();
    } catch (err: any) {
      if (uploadedPath) {
        await withTimeout(
          supabase.storage.from("documents").remove([uploadedPath]),
          SUPABASE_REQUEST_TIMEOUT_MS,
          "Leave attachment rollback",
        ).catch(() => undefined);
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: "status-badge-pending",
      approved: "status-badge-active",
      rejected: "status-badge-rejected",
    };
    return <span className={map[status] || ""}>{status}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leave Requests</h1>
          <p className="text-muted-foreground">Apply and track your leave</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Apply for Leave</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Leave Request</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Leave Type</Label>
                <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="sick">Sick</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="maternity">Maternity</SelectItem>
                    <SelectItem value="paternity">Paternity</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required placeholder="Briefly describe the reason..." />
              </div>
              <div className="space-y-2">
                <Label>Supporting Document (Optional)</Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">Accepted: PDF, JPG, PNG (max 5MB)</p>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin mr-2" />} Submit Request
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="wf-panel">
        <CardContent className="pt-6">
          <Table>
            <TableHeader className="wf-table-head">
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Comment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
              ) : leaves.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No leave requests</TableCell></TableRow>
              ) : (
                leaves.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell className="capitalize font-medium">{leave.leave_type}</TableCell>
                    <TableCell>{new Date(leave.start_date).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(leave.end_date).toLocaleDateString()}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{leave.reason}</TableCell>
                    <TableCell>{statusBadge(leave.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                      {leave.admin_comment || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
