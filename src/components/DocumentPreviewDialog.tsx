import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDocumentPreviewKind, requestDocumentSignedUrl, type DocumentRecord } from "@/lib/hrPortal";
import { Loader2, Download, ExternalLink, FileText } from "lucide-react";

interface DocumentPreviewDialogProps {
  document: DocumentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentPreviewDialog({ document, open, onOpenChange }: DocumentPreviewDialogProps) {
  const [signedUrl, setSignedUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const previewKind = useMemo(
    () => getDocumentPreviewKind(document?.file_name, document?.file_type),
    [document?.file_name, document?.file_type],
  );

  useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      if (!open || !document) {
        setSignedUrl("");
        setError("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const url = await requestDocumentSignedUrl(supabase, document.storage_path || document.file_url);
        if (!cancelled) {
          setSignedUrl(url);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Preview could not be loaded.");
          setSignedUrl("");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
    };
  }, [document, open]);

  const handleOpenNewTab = () => {
    if (signedUrl) {
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleDownload = () => {
    if (!signedUrl || !document) return;

    const link = window.document.createElement("a");
    link.href = signedUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.download = document.file_name || "document";
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{document?.file_name || "Document Preview"}</DialogTitle>
          <DialogDescription>
            {document ? `${document.category.replace("_", " ")} · ${document.file_type.toUpperCase()}` : "Preview employee document"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex h-[60vh] items-center justify-center rounded-lg border">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-3 rounded-lg border text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">Preview unavailable</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : previewKind === "image" && signedUrl ? (
            <ScrollArea className="h-[60vh] rounded-lg border">
              <div className="flex min-h-[60vh] items-center justify-center bg-muted/30 p-4">
                <img src={signedUrl} alt={document?.file_name || "Document preview"} className="max-h-full max-w-full rounded-md object-contain shadow-sm" />
              </div>
            </ScrollArea>
          ) : previewKind === "pdf" && signedUrl ? (
            <iframe
              src={signedUrl}
              title={document?.file_name || "Document preview"}
              className="h-[60vh] w-full rounded-lg border bg-background"
            />
          ) : (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-3 rounded-lg border text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">Inline preview is not available for this file type.</p>
                <p className="text-sm text-muted-foreground">Use Open or Download to inspect the document.</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleOpenNewTab} disabled={!signedUrl}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open
            </Button>
            <Button type="button" onClick={handleDownload} disabled={!signedUrl}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
