import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronDown, Download, Eye, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { cn } from "@/lib/utils";
import {
  filterEmployeeProfiles,
  normalizeDocumentRecord,
  normalizeProfileRecord,
  requestDocumentSignedUrl,
  type DocumentRecord,
  type ProfileRecord,
} from "@/lib/hrPortal";
import { SUPABASE_REQUEST_TIMEOUT_MS, withTimeoutFallback } from "@/lib/async";

interface EmployeeDocument extends DocumentRecord {}

interface EmployeeDocumentGroup {
  employee: ProfileRecord;
  documents: EmployeeDocument[];
  lastUploadedAt: string | null;
}

const buildFallbackProfile = (userId: string): ProfileRecord => ({
  user_id: userId,
  name: "Unknown User",
  email: userId,
  phone: "",
  gender: "",
  position: "",
  id_passport: "",
  license: "",
  status: "active",
  profile_completed: false,
});

export default function AdminDocuments() {
  const { toast } = useToast();
  const [groups, setGroups] = useState<EmployeeDocumentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentRecord | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [
          { data: documentRows, error: documentsError },
          { data: profileRows, error: profilesError },
          { data: roleRows, error: rolesError },
        ] = await withTimeoutFallback(
          Promise.all([
            supabase.from("documents").select("*").order("uploaded_at", { ascending: false }),
            supabase.from("employee_profiles").select("*"),
            supabase.from("user_roles").select("user_id, role"),
          ]),
          [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ] as any,
          SUPABASE_REQUEST_TIMEOUT_MS,
        );

        if (documentsError) throw documentsError;
        if (profilesError) throw profilesError;
        if (rolesError) throw rolesError;

        const employeeProfiles = filterEmployeeProfiles(
          ((profileRows as any[]) ?? []).map((profile) => normalizeProfileRecord(profile)),
          roleRows ?? [],
        );

        const documentsByUserId = ((documentRows as any[]) ?? []).reduce<Record<string, EmployeeDocument[]>>((acc, row) => {
          const document = normalizeDocumentRecord(row);
          if (!document.user_id) return acc;
          if (!acc[document.user_id]) {
            acc[document.user_id] = [];
          }
          acc[document.user_id].push(document);
          return acc;
        }, {});

        const profileMap = new Map(employeeProfiles.filter((profile) => profile.user_id).map((profile) => [profile.user_id as string, profile]));

        const employeeGroups = employeeProfiles.map((employee) => {
          const documents = employee.user_id ? (documentsByUserId[employee.user_id] ?? []) : [];
          return {
            employee,
            documents,
            lastUploadedAt: documents[0]?.uploaded_at ?? null,
          };
        });

        const orphanGroups = Object.entries(documentsByUserId)
          .filter(([userId]) => !profileMap.has(userId))
          .map(([userId, documents]) => ({
            employee: buildFallbackProfile(userId),
            documents,
            lastUploadedAt: documents[0]?.uploaded_at ?? null,
          }));

        setGroups([...employeeGroups, ...orphanGroups]);
      } catch (err) {
        console.error("Failed to fetch admin documents:", err);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, []);

  const processedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      if (a.lastUploadedAt && b.lastUploadedAt) {
        return new Date(b.lastUploadedAt).getTime() - new Date(a.lastUploadedAt).getTime();
      }
      if (a.lastUploadedAt) return -1;
      if (b.lastUploadedAt) return 1;
      return a.employee.name.localeCompare(b.employee.name);
    });
  }, [groups]);

  const categoryLabel = (category: string) => {
    const map: Record<string, string> = {
      id_proof: "ID Proof",
      cv: "CV",
      certificate: "Certificate",
    };

    return map[category] || category;
  };

  const handleDownload = async (document: EmployeeDocument) => {
    try {
      const signedUrl = await requestDocumentSignedUrl(supabase, document.storage_path || document.file_url);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast({ title: "Download unavailable", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-muted-foreground">Browse employee documents by user</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Last Upload</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center">
                    <Loader2 className="mx-auto animate-spin" />
                  </TableCell>
                </TableRow>
              ) : processedGroups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No employee documents found
                  </TableCell>
                </TableRow>
              ) : (
                processedGroups.map((group) => {
                  const userId = group.employee.user_id || group.employee.email;
                  const isExpanded = expandedUserId === userId;

                  return (
                    <Fragment key={userId}>
                      <TableRow>
                        <TableCell className="font-medium">{group.employee.name || "-"}</TableCell>
                        <TableCell>{group.employee.email || "-"}</TableCell>
                        <TableCell>{group.employee.position || "-"}</TableCell>
                        <TableCell>{group.documents.length}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {group.lastUploadedAt ? new Date(group.lastUploadedAt).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setExpandedUserId((current) => current === userId ? null : userId);
                              }}
                            >
                              <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/20 p-0">
                            <div className="space-y-4 px-6 py-5">
                              <div>
                                <p className="font-medium">Documents for {group.employee.name || group.employee.email}</p>
                                <p className="text-sm text-muted-foreground">
                                  {group.documents.length === 0
                                    ? "No documents uploaded for this user yet."
                                    : `${group.documents.length} document${group.documents.length === 1 ? "" : "s"} available`}
                                </p>
                              </div>

                              {group.documents.length === 0 ? (
                                <div className="rounded-lg border border-dashed bg-background/80 px-4 py-5 text-sm text-muted-foreground">
                                  This user has not uploaded any documents yet.
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {group.documents.map((document) => (
                                    <div
                                      key={document.id}
                                      className="flex flex-col gap-3 rounded-lg border bg-background px-4 py-3 md:flex-row md:items-center md:justify-between"
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className="rounded-md bg-primary/10 p-2 text-primary">
                                          <FileText className="h-4 w-4" />
                                        </div>
                                        <div>
                                          <p className="font-medium">{document.file_name}</p>
                                          <p className="text-sm text-muted-foreground">
                                            {categoryLabel(document.category)} | {document.file_type.toUpperCase()} | {new Date(document.uploaded_at).toLocaleDateString()}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setPreviewDocument(document)}>
                                          <Eye className="mr-2 h-4 w-4" />
                                          Preview
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleDownload(document)}>
                                          <Download className="mr-2 h-4 w-4" />
                                          Download
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DocumentPreviewDialog
        document={previewDocument}
        open={!!previewDocument}
        onOpenChange={(open) => {
          if (!open) setPreviewDocument(null);
        }}
      />
    </div>
  );
}
