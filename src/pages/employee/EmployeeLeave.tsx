import { useEffect, useMemo, useState } from "react";
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
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { buildDocumentInsertPayload, buildLeaveInsertPayload, normalizeDocumentRecord, normalizeLeaveRecord, type DocumentRecord } from "@/lib/hrPortal";
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
  attachment: DocumentRecord | null;
}

export default function EmployeeLeave() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentRecord | null>(null);
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
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
      const [{ data: leaveRows, error: leaveError }, { data: documentRows, error: documentError }] = await withTimeoutFallback(
        Promise.all([
          supabase.from("leave_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
          supabase.from("documents").select("*").eq("user_id", user.id).not("leave_request_id", "is", null).order("uploaded_at", { ascending: false }),
        ]),
        [{ data: [], error: null }, { data: [], error: null }] as any,
        SUPABASE_REQUEST_TIMEOUT_MS,
      );
      if (leaveError) throw leaveError;
      if (documentError) throw documentError;
      const attachmentByLeaveIdAndUser = new Map<string, DocumentRecord>();
      ((documentRows as any[]) ?? []).forEach((doc) => {
        const normalized = normalizeDocumentRecord(doc);
        if (!normalized.leave_request_id || !normalized.user_id) return;
        const key = `${normalized.leave_request_id}:${normalized.user_id}`;
        if (attachmentByLeaveIdAndUser.has(key)) return;
        attachmentByLeaveIdAndUser.set(key, normalized);
      });
      setLeaves(
        ((leaveRows as any[]) ?? []).map((leave) => {
          const normalized = normalizeLeaveRecord(leave);
          const attachmentKey = `${normalized.id}:${normalized.user_id}`;
          return {
            ...normalized,
            attachment: attachmentByLeaveIdAndUser.get(attachmentKey) ?? null,
          };
        }),
      );
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
    let leaveRequestId: string | null = null;
    try {
      const payload = buildLeaveInsertPayload(user.id, form);
      const { data: createdLeave, error: leaveError } = await withTimeout(
        supabase.from("leave_requests").insert(payload as any).select("id").single(),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Leave submission",
      );
      if (leaveError) throw leaveError;
      leaveRequestId = (createdLeave as { id?: string } | null)?.id ?? null;
      if (!leaveRequestId) throw new Error("Leave request could not be created.");

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

        const docPayload = buildDocumentInsertPayload(user.id, path, attachment, "certificate", leaveRequestId);
        const { error: docError } = await withTimeout(
          supabase.from("documents").insert(docPayload as any),
          SUPABASE_REQUEST_TIMEOUT_MS,
          "Leave attachment save",
        );
        if (docError) throw docError;
      }

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
      if (leaveRequestId) {
        await withTimeout(
          supabase.from("leave_requests").delete().eq("id", leaveRequestId),
          SUPABASE_REQUEST_TIMEOUT_MS,
          "Leave submission rollback",
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

  const filteredLeaves = useMemo(() => {
    let list = [...leaves];
    if (!filterFromDate && !filterToDate) return list;

    const from = filterFromDate ? new Date(`${filterFromDate}T00:00:00`) : null;
    const to = filterToDate ? new Date(`${filterToDate}T23:59:59`) : null;

    list = list.filter((leave) => {
      const leaveStart = new Date(`${leave.start_date}T00:00:00`);
      const leaveEnd = new Date(`${leave.end_date}T23:59:59`);
      if (Number.isNaN(leaveStart.getTime()) || Number.isNaN(leaveEnd.getTime())) return false;
      if (from && leaveEnd < from) return false;
      if (to && leaveStart > to) return false;
      return true;
    });

    return list;
  }, [leaves, filterFromDate, filterToDate]);

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
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="leave-filter-from">From Date</Label>
              <Input
                id="leave-filter-from"
                type="date"
                value={filterFromDate}
                onChange={(e) => setFilterFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="leave-filter-to">To Date</Label>
              <Input
                id="leave-filter-to"
                type="date"
                value={filterToDate}
                onChange={(e) => setFilterToDate(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFilterFromDate("");
                setFilterToDate("");
              }}
              disabled={!filterFromDate && !filterToDate}
            >
              Reset
            </Button>
          </div>

          <Table>
            <TableHeader className="wf-table-head">
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Comment</TableHead>
                <TableHead>Attachment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
              ) : filteredLeaves.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No leave requests</TableCell></TableRow>
              ) : (
                filteredLeaves.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell className="capitalize font-medium">{leave.leave_type}</TableCell>
                    <TableCell>{new Date(leave.start_date).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(leave.end_date).toLocaleDateString()}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{leave.reason}</TableCell>
                    <TableCell>{statusBadge(leave.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                      {leave.admin_comment || "-"}
                    </TableCell>
                    <TableCell>
                      {leave.attachment ? (
                        <Button variant="outline" size="sm" onClick={() => setSelectedDocument(leave.attachment)}>
                          View
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DocumentPreviewDialog
        document={selectedDocument}
        open={!!selectedDocument}
        onOpenChange={(open) => {
          if (!open) setSelectedDocument(null);
        }}
      />
    </div>
  );
}
