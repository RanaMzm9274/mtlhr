import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useParams } from "react-router-dom";
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
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/NotFound";
import PendingApproval from "@/pages/PendingApproval";
import SuperAdminCompanies from "@/pages/superadmin/SuperAdminCompanies";
import { Loader2 } from "lucide-react";

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  const defaultHome = role === "super_admin"
    ? "/super-admin/companies"
    : role === "admin"
      ? companySlug ? `/${companySlug}` : "/pending-approval"
      : companySlug ? `/${companySlug}/employee/dashboard` : "/login";

  const pendingBlocked = !!user && role === "admin" && (companyStatus === "pending" || companyStatus === "rejected");

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={pendingBlocked ? "/pending-approval" : defaultHome} replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to={pendingBlocked ? "/pending-approval" : defaultHome} replace /> : <Signup />} />
      <Route path="/:companySlug/login" element={<Navigate to="/login" replace />} />
      <Route path="/set-password" element={<SetPassword />} />
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

      <Route path="/:companySlug" element={<ProtectedRoute requiredRole="admin"><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="employees" element={<EmployeeList />} />
        <Route path="leaves" element={<AdminLeaves />} />
        <Route path="attendance" element={<AdminAttendance />} />
        <Route path="documents" element={<AdminDocuments />} />
        <Route path="profile" element={<AdminProfile />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="/:companySlug/employee" element={<ProtectedRoute requiredRole="employee"><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<EmployeeDashboard />} />
        <Route path="profile" element={<EmployeeProfile />} />
        <Route path="documents" element={<EmployeeDocuments />} />
        <Route path="leave" element={<EmployeeLeave />} />
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
      <BrowserRouter basename={(window as Window & { MTLHR_PORTAL_BASE_PATH?: string }).MTLHR_PORTAL_BASE_PATH || "/"}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

