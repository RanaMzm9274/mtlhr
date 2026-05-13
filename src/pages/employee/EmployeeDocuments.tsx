import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload, Trash2, Download, Loader2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { buildDocumentInsertPayload, normalizeDocumentRecord } from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeout, withTimeoutFallback } from "@/lib/async";

interface Document {
  id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  category: string;
  uploaded_at: string;
}

export default function EmployeeDocuments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("id_proof");

  const fetchDocs = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await withTimeoutFallback(
        supabase.from("documents").select("*").eq("user_id", user.id).order("uploaded_at", { ascending: false }),
        { data: [], error: null } as any,
        SUPABASE_REQUEST_TIMEOUT_MS,
      );
      if (error) console.error("Failed to fetch documents:", error);
      setDocuments(((data as any[]) ?? []).map((doc) => normalizeDocumentRecord(doc)));
    } catch (err) {
      console.error("Error fetching documents:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, [user]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Only PDF, JPG, PNG allowed", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    let uploadedPath: string | null = null;
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await withTimeout(
        supabase.storage.from("documents").upload(path, file),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Document upload",
      );
      if (uploadError) throw uploadError;
      uploadedPath = path;

      const payload = buildDocumentInsertPayload(user.id, path, file, category);
      const { error: dbError } = await withTimeout(
        supabase.from("documents").insert(payload as any),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Document save",
      );
      if (dbError) throw dbError;

      toast({ title: "Document uploaded" });
      fetchDocs();
    } catch (err: any) {
      if (uploadedPath) {
        await withTimeout(
          supabase.storage.from("documents").remove([uploadedPath]),
          SUPABASE_REQUEST_TIMEOUT_MS,
          "Document upload rollback",
        ).catch(() => undefined);
      }
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!doc.file_url) {
      toast({ title: "File path missing", description: "This document record has no storage path.", variant: "destructive" });
      return;
    }

    await withTimeout(
      supabase.storage.from("documents").remove([doc.file_url]),
      SUPABASE_REQUEST_TIMEOUT_MS,
      "Document delete",
    );
    await withTimeout(
      supabase.from("documents").delete().eq("id", doc.id),
      SUPABASE_REQUEST_TIMEOUT_MS,
      "Document record delete",
    );
    toast({ title: "Document deleted" });
    fetchDocs();
  };

  const handleDownload = async (doc: Document) => {
    if (!doc.file_url) {
      toast({ title: "Download unavailable", description: "This document record has no storage path.", variant: "destructive" });
      return;
    }

    const { data } = await withTimeout(
      supabase.storage.from("documents").createSignedUrl(doc.file_url, 60),
      SUPABASE_REQUEST_TIMEOUT_MS,
      "Document download link",
    );
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const categoryLabel = (cat: string) => {
    const map: Record<string, string> = { id_proof: "Passport", cv: "Share Code", certificate: "Work Permit" };
    return map[cat] || cat;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Documents</h1>
          <p className="text-muted-foreground">Upload and manage your documents</p>
        </div>
      </div>

      <Card className="wf-panel">
        <CardHeader>
          <CardTitle className="text-base">Upload Document</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id_proof">Passport</SelectItem>
                <SelectItem value="cv">Share code</SelectItem>
                <SelectItem value="certificate">Work Permit</SelectItem>
              </SelectContent>
            </Select>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUpload} className="hidden" />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="animate-spin mr-2" /> : <Upload className="mr-2 h-4 w-4" />}
              {uploading ? "Uploading..." : "Choose File"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Accepted: PDF, JPG, PNG (max 5MB)</p>
        </CardContent>
      </Card>

      <Card className="wf-panel">
        <CardContent className="pt-6">
          <Table>
            <TableHeader className="wf-table-head">
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
              ) : documents.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No documents yet</TableCell></TableRow>
              ) : (
                documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-muted-foreground" />{doc.file_name}</TableCell>
                    <TableCell>{categoryLabel(doc.category)}</TableCell>
                    <TableCell className="uppercase text-xs text-muted-foreground">{doc.file_type}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(doc.uploaded_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleDownload(doc)}><Download className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(doc)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </div>
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
