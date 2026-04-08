import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Check, X, Loader2, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  admin_comment: string | null;
  created_at: string;
  employee_profiles?: { name: string; email: string } | null;
}

export default function AdminLeaves() {
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [comment, setComment] = useState("");
  const [updating, setUpdating] = useState(false);

  const fetchLeaves = async () => {
    const { data } = await supabase
      .from("leave_requests")
      .select("*, employee_profiles!leave_requests_user_id_fkey(name, email)")
      .order("created_at", { ascending: false });
    setLeaves((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchLeaves(); }, []);

  const handleAction = async (id: string, status: "approved" | "rejected") => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("leave_requests")
        .update({ status, admin_comment: comment })
        .eq("id", id);
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

  const filtered = leaves.filter((l) => filter === "all" || l.status === filter);

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
      <div>
        <h1 className="text-2xl font-bold">Leave Requests</h1>
        <p className="text-muted-foreground">Manage employee leave applications</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex gap-2">
            {(["all", "pending", "approved", "rejected"] as const).map((f) => (
              <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)} className="capitalize">
                {f}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No leave requests</TableCell></TableRow>
              ) : (
                filtered.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell className="font-medium">{leave.employee_profiles?.name || "—"}</TableCell>
                    <TableCell className="capitalize">{leave.leave_type}</TableCell>
                    <TableCell>{new Date(leave.start_date).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(leave.end_date).toLocaleDateString()}</TableCell>
                    <TableCell>{statusBadge(leave.status)}</TableCell>
                    <TableCell>
                      {leave.status === "pending" ? (
                        <Button variant="outline" size="sm" onClick={() => { setSelectedLeave(leave); setComment(""); }}>
                          <MessageSquare className="h-4 w-4 mr-1" /> Review
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
                <div><span className="text-muted-foreground">Employee:</span> <span className="font-medium">{selectedLeave.employee_profiles?.name}</span></div>
                <div><span className="text-muted-foreground">Type:</span> <span className="font-medium capitalize">{selectedLeave.leave_type}</span></div>
                <div><span className="text-muted-foreground">From:</span> <span>{new Date(selectedLeave.start_date).toLocaleDateString()}</span></div>
                <div><span className="text-muted-foreground">To:</span> <span>{new Date(selectedLeave.end_date).toLocaleDateString()}</span></div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Reason:</p>
                <p className="text-sm bg-muted p-3 rounded-md">{selectedLeave.reason}</p>
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
    </div>
  );
}
