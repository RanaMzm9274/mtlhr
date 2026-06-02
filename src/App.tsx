import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, Navigate, useLocation, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import SetPassword from "@/pages/SetPassword";
import DashboardLayout from "@/components/DashboardLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import EmployeeList from "@/pages/admin/EmployeeList";
import AdminLeaves from "@/pages/admin/AdminLeaves";
import AdminAttendance from "@/pages/admin/AdminAttendance";
import AdminDocuments from "@/pages/admin/AdminDocuments";
import AdminProfile from "@/pages/admin/AdminProfile";
import EmployeeDashboard from "@/pages/employee/EmployeeDashboard";
import EmployeeProfile from "@/pages/employee/EmployeeProfile";
import EmployeeDocuments from "@/pages/employee/EmployeeDocuments";
import EmployeeLeave from "@/pages/employee/EmployeeLeave";
import EmployeeOnboardingProfile from "@/pages/employee/EmployeeOnboardingProfile";
import EmployeeOnboardingDocuments from "@/pages/employee/EmployeeOnboardingDocuments";
import SettingsPage from "@/pages/SettingsPage";
import MessagesPage from "@/pages/MessagesPage";
import NotFound from "@/pages/NotFound";
import PendingApproval from "@/pages/PendingApproval";
import SuperAdminCompanies from "@/pages/superadmin/SuperAdminCompanies";
import { Loader2 } from "lucide-react";
import { getBasePath } from "@/lib/basePath";
import { supabase } from "@/integrations/supabase/client";
import { getProfileCompletion, normalizeProfileRecord } from "@/lib/hrPortal";

const queryClient = new QueryClient();

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: "super_admin" | "admin" | "employee" }) {
  const { user, role, loading, companyStatus, companySlug } = useAuth();
  const params = useParams();
  const pathSlug = params.companySlug;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requiredRole !== "super_admin") {
    if (role === "admin" && companyStatus && companyStatus !== "approved") {
      return <Navigate to="/pending-approval" replace />;
    }
    if (companySlug && pathSlug && companySlug !== pathSlug) {
      const target = requiredRole === "admin" ? `/${companySlug}` : `/${companySlug}/employee/dashboard`;
      return <Navigate to={target} replace />;
    }
  }

  if (requiredRole === "super_admin" && role !== "super_admin") return <Navigate to="/login" replace />;
  if (requiredRole === "admin" && role !== "admin") return <Navigate to={role === "employee" && companySlug ? `/${companySlug}/employee/dashboard` : "/login"} replace />;
  if (requiredRole === "employee" && role !== "employee") return <Navigate to={role === "admin" && companySlug ? `/${companySlug}` : "/super-admin/companies"} replace />;

  return <>{children}</>;
}

function AppRoutes() {
  const { user, role, loading, companyStatus, companySlug } = useAuth();
  const location = useLocation();
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [needsProfileOnboarding, setNeedsProfileOnboarding] = useState(false);
  const [needsDocumentsOnboarding, setNeedsDocumentsOnboarding] = useState(false);
  const [onboardingEvaluatedPath, setOnboardingEvaluatedPath] = useState("");

  useEffect(() => {
    let active = true;
    const evaluateOnboarding = async () => {
      if (!user || role !== "employee") {
        if (!active) return;
        setOnboardingLoading(false);
        setNeedsProfileOnboarding(false);
        setNeedsDocumentsOnboarding(false);
        setOnboardingEvaluatedPath(location.pathname);
        return;
      }

      setOnboardingLoading(true);
      try {
        const [{ data: profileRow }, { data: documentRows }] = await Promise.all([
          supabase
            .from("employee_profiles")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("documents")
            .select("category")
            .eq("user_id", user.id),
        ]);

        if (!active) return;
        const normalizedProfile = normalizeProfileRecord(profileRow as any, user);
        const profileDone = getProfileCompletion(normalizedProfile) === 100;
        const uploaded = new Set(
          ((documentRows as Array<{ category?: string }>) ?? [])
            .map((row) => row.category)
            .filter(Boolean) as string[],
        );
        const docsDone = uploaded.size > 0;
        setNeedsProfileOnboarding(!profileDone);
        setNeedsDocumentsOnboarding(profileDone && !docsDone);
        setOnboardingEvaluatedPath(location.pathname);
      } catch {
        if (!active) return;
        setNeedsProfileOnboarding(true);
        setNeedsDocumentsOnboarding(false);
        setOnboardingEvaluatedPath(location.pathname);
      } finally {
        if (active) setOnboardingLoading(false);
      }
    };

    void evaluateOnboarding();
    return () => {
      active = false;
    };
  }, [role, user, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  const searchParams = new URLSearchParams(location.search);
  const inviteType = searchParams.get("type");
  const hasInviteQuery = (inviteType === "invite" || inviteType === "recovery") && (!!searchParams.get("token_hash") || !!searchParams.get("code"));
  const hasInviteHash = location.hash.includes("access_token=") && (location.hash.includes("type=invite") || location.hash.includes("type=recovery"));
  const hasInvitePayload = hasInviteQuery || hasInviteHash;
  const setPasswordTarget = `/set-password${location.search || ""}${location.hash || ""}`;

  if (hasInvitePayload && location.pathname !== "/set-password") {
    return <Navigate to={setPasswordTarget} replace />;
  }

  const isSetPasswordRoute = location.pathname === "/set-password" || location.pathname === "/reset-password";

  if (!isSetPasswordRoute && user && role === "employee" && companySlug) {
    if (onboardingLoading || onboardingEvaluatedPath !== location.pathname) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin h-8 w-8 text-primary" />
        </div>
      );
    }

    const onboardingProfilePath = `/${companySlug}/employee/onboarding/profile`;
    const onboardingDocumentsPath = `/${companySlug}/employee/onboarding/documents`;
    const requiredOnboardingPath = needsProfileOnboarding
      ? onboardingProfilePath
      : needsDocumentsOnboarding
        ? onboardingDocumentsPath
        : null;

    if (requiredOnboardingPath && location.pathname !== requiredOnboardingPath) {
      return <Navigate to={requiredOnboardingPath} replace />;
    }
  }

  const defaultHome = role === "super_admin"
    ? "/super-admin/companies"
    : role === "admin"
      ? companySlug ? `/${companySlug}` : "/pending-approval"
      : companySlug ? `/${companySlug}/employee/dashboard` : "/login";

  const pendingBlocked = !!user && role === "admin" && (companyStatus === "pending" || companyStatus === "rejected");

  const adminPath = (path: string) => {
    if (!companySlug) return "/pending-approval";
    return path ? `/${companySlug}/${path}` : `/${companySlug}`;
  };

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={pendingBlocked ? "/pending-approval" : defaultHome} replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to={pendingBlocked ? "/pending-approval" : defaultHome} replace /> : <Signup />} />
      <Route path="/:companySlug/login" element={<Navigate to="/login" replace />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/reset-password" element={<SetPassword />} />
      <Route
        path="/pending-approval"
        element={
          !user
            ? <Navigate to="/login" replace />
            : role === "admin" && companyStatus === "approved" && companySlug
              ? <Navigate to={`/${companySlug}`} replace />
              : <PendingApproval />
        }
      />
      <Route path="/" element={user ? <Navigate to={pendingBlocked ? "/pending-approval" : defaultHome} replace /> : <Navigate to="/login" replace />} />

      <Route path="/super-admin" element={<ProtectedRoute requiredRole="super_admin"><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/super-admin/companies" replace />} />
        <Route path="companies" element={<SuperAdminCompanies />} />
      </Route>

      <Route
        path="/employees"
        element={<Navigate to={adminPath("employees")} replace />}
      />
      <Route
        path="/leaves"
        element={<Navigate to={adminPath("leaves")} replace />}
      />
      <Route
        path="/attendance"
        element={<Navigate to={adminPath("attendance")} replace />}
      />
      <Route
        path="/documents"
        element={<Navigate to={adminPath("documents")} replace />}
      />
      <Route
        path="/profile"
        element={<Navigate to={adminPath("profile")} replace />}
      />
      <Route
        path="/messages"
        element={<Navigate to={adminPath("messages")} replace />}
      />
      <Route
        path="/settings"
        element={<Navigate to={adminPath("settings")} replace />}
      />

      <Route path="/:companySlug" element={<ProtectedRoute requiredRole="admin"><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="employees" element={<EmployeeList />} />
        <Route path="leaves" element={<AdminLeaves />} />
        <Route path="attendance" element={<AdminAttendance />} />
        <Route path="documents" element={<AdminDocuments />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="profile" element={<AdminProfile />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="/:companySlug/employee" element={<ProtectedRoute requiredRole="employee"><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="onboarding/profile" element={<EmployeeOnboardingProfile />} />
        <Route path="onboarding/documents" element={<EmployeeOnboardingDocuments />} />
        <Route path="dashboard" element={<EmployeeDashboard />} />
        <Route path="profile" element={<EmployeeProfile />} />
        <Route path="documents" element={<EmployeeDocuments />} />
        <Route path="leave" element={<EmployeeLeave />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={getBasePath()}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

