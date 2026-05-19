import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, X, Loader2, MessageSquare, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Paperclip } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { removeUndefined } from "@/lib/utils";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { indexProfilesByUserId, normalizeDocumentRecord, normalizeLeaveRecord, type DocumentRecord, type LeaveRecord, type ProfileRecord } from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeoutFallback } from "@/lib/async";

interface LeaveRequest extends LeaveRecord {
  employee: ProfileRecord | null;
  attachment: DocumentRecord | null;
}

type SortKey = "employee" | "leave_type" | "start_date" | "status" | "created_at";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

export default function AdminLeaves() {
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [comment, setComment] = useState("");
  const [updating, setUpdating] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentRecord | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const fetchLeaves = async () => {
    try {
      const [{ data: leaveRows, error: leavesError }, { data: profileRows, error: profilesError }, { data: documentRows, error: documentsError }] = await withTimeoutFallback(
        Promise.all([
          supabase.from("leave_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("employee_profiles").select("*"),
          supabase.from("documents").select("*").not("leave_request_id", "is", null).order("uploaded_at", { ascending: false }),
        ]),
        [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ] as any,
        SUPABASE_REQUEST_TIMEOUT_MS,
      );

      if (leavesError) throw leavesError;
      if (profilesError) throw profilesError;
      if (documentsError) throw documentsError;

      const profilesByUserId = indexProfilesByUserId(profileRows as any[]);
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
          const normalizedLeave = normalizeLeaveRecord(leave);
          const attachmentKey = `${normalizedLeave.id}:${normalizedLeave.user_id}`;
          return {
            ...normalizedLeave,
            employee: profilesByUserId.get(normalizedLeave.user_id) ?? null,
            attachment: attachmentByLeaveIdAndUser.get(attachmentKey) ?? null,
          };
        }),
      );
    } catch (err) {
      console.error("Failed to fetch admin leaves:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  const handleAction = async (id: string, status: "approved" | "rejected") => {
    setUpdating(true);
    try {
      const payload = removeUndefined({
        status,
        admin_comment: comment,
      });

      const { error } = await supabase.from("leave_requests").update(payload as any).eq("id", id);
      if (error) throw error;

      toast({ title: `Leave ${status}` });
      setSelectedLeave(null);
      setComment("");
      fetchLeaves();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUpdating(false);
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

  const processed = useMemo(() => {
    const filtered = filter === "all" ? [...leaves] : leaves.filter((leave) => leave.status === filter);
    filtered.sort((a, b) => {
      const aValue = sortKey === "employee"
        ? (a.employee?.name || a.employee?.email || "").toLowerCase()
        : (a[sortKey] ?? "").toString().toLowerCase();
      const bValue = sortKey === "employee"
        ? (b.employee?.name || b.employee?.email || "").toLowerCase()
        : (b[sortKey] ?? "").toString().toLowerCase();

      return sortDir === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    });

    return filtered;
  }, [filter, leaves, sortDir, sortKey]);

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const paged = processed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />;
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
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Leave Requests</h1>
        <p className="text-muted-foreground">Manage employee leave applications</p>
      </div>

      <Card className="wf-panel">
        <CardHeader className="pb-3">
          <div className="flex gap-2">
            {(["all", "pending", "approved", "rejected"] as const).map((value) => (
              <Button
                key={value}
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
                className={`capitalize ${filter === value ? "wf-filter-btn-active" : "wf-filter-btn"}`}
              >
                {value}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader className="wf-table-head">
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("employee")}>
                  Employee <SortIcon col="employee" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("leave_type")}>
                  Type <SortIcon col="leave_type" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("start_date")}>
                  From <SortIcon col="start_date" />
                </TableHead>
                <TableHead>To</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("status")}>
                  Status <SortIcon col="status" />
                </TableHead>
                <TableHead>Attachment</TableHead>
                <TableHead>Actions</TableHead>
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
                    No leave requests
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell className="font-medium">{leave.employee?.name || leave.employee?.email || "-"}</TableCell>
                    <TableCell className="capitalize">{leave.leave_type}</TableCell>
                    <TableCell>{new Date(leave.start_date).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(leave.end_date).toLocaleDateString()}</TableCell>
                    <TableCell>{statusBadge(leave.status)}</TableCell>
                    <TableCell>
                      {leave.attachment ? (
                        <Button variant="outline" size="sm" onClick={() => setSelectedDocument(leave.attachment)}>
                          View
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="bg-success hover:bg-success/90 text-success-foreground"
                          onClick={() => handleAction(leave.id, "approved")}
                          disabled={updating || leave.status === "approved"}
                        >
                          <Check className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleAction(leave.id, "rejected")}
                          disabled={updating || leave.status === "rejected"}
                        >
                          <X className="h-4 w-4 mr-1" /> Reject
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setSelectedLeave(leave); setComment(leave.admin_comment ?? ""); }}>
                          <MessageSquare className="h-4 w-4 mr-1" /> Review
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedDocument(leave.attachment)}
                          disabled={!leave.attachment}
                        >
                          <Paperclip className="h-4 w-4 mr-1" /> View Attachment
                        </Button>
                      </div>
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

      <Dialog open={!!selectedLeave} onOpenChange={() => setSelectedLeave(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Leave Request</DialogTitle>
          </DialogHeader>
          {selectedLeave && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Employee:</span> <span className="font-medium">{selectedLeave.employee?.name || selectedLeave.employee?.email}</span></div>
                <div><span className="text-muted-foreground">Type:</span> <span className="font-medium capitalize">{selectedLeave.leave_type}</span></div>
                <div><span className="text-muted-foreground">From:</span> <span>{new Date(selectedLeave.start_date).toLocaleDateString()}</span></div>
                <div><span className="text-muted-foreground">To:</span> <span>{new Date(selectedLeave.end_date).toLocaleDateString()}</span></div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Reason:</p>
                <p className="text-sm bg-muted p-3 rounded-md">{selectedLeave.reason}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Attachment:</p>
                {selectedLeave.attachment ? (
                  <Button variant="outline" size="sm" onClick={() => setSelectedDocument(selectedLeave.attachment)}>
                    View Attached Document
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">No attachment</p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Admin Comment (optional):</p>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment..." />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 bg-success hover:bg-success/90 text-success-foreground" onClick={() => handleAction(selectedLeave.id, "approved")} disabled={updating}>
                  <Check className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => handleAction(selectedLeave.id, "rejected")} disabled={updating}>
                  <X className="h-4 w-4 mr-1" /> Reject
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
