import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, Loader2, FileText } from "lucide-react";

interface Document {
  id: string;
  user_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  category: string;
  uploaded_at: string;
  employee_profiles?: { name: string; email: string } | null;
}

export default function AdminDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("documents")
        .select("*, employee_profiles!documents_user_id_fkey(name, email)")
        .order("uploaded_at", { ascending: false });
      setDocuments((data as any) ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  const categoryLabel = (cat: string) => {
    const map: Record<string, string> = { id_proof: "ID Proof", cv: "CV", certificate: "Certificate" };
    return map[cat] || cat;
  };

  const handleDownload = async (doc: Document) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(doc.file_url, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-muted-foreground">All employee documents</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>File Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
              ) : documents.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No documents uploaded</TableCell></TableRow>
              ) : (
                documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.employee_profiles?.name || "—"}</TableCell>
                    <TableCell className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />{doc.file_name}</TableCell>
                    <TableCell>{categoryLabel(doc.category)}</TableCell>
                    <TableCell className="uppercase text-xs text-muted-foreground">{doc.file_type}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(doc.uploaded_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleDownload(doc)}>
                        <Download className="h-4 w-4" />
                      </Button>
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
