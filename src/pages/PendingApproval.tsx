import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PendingApproval() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Company Approval Pending</CardTitle>
          <CardDescription>
            Your account exists, but your company is not approved yet by super admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Once approved, sign in again to access your admin dashboard.
        </CardContent>
      </Card>
    </div>
  );
}
