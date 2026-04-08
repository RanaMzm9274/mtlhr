import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "@/pages/Login";
import SetPassword from "@/pages/SetPassword";
import DashboardLayout from "@/components/DashboardLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import EmployeeList from "@/pages/admin/EmployeeList";
import AdminLeaves from "@/pages/admin/AdminLeaves";
import AdminDocuments from "@/pages/admin/AdminDocuments";
import AdminProfile from "@/pages/admin/AdminProfile";
import EmployeeDashboard from "@/pages/employee/EmployeeDashboard";
import EmployeeProfile from "@/pages/employee/EmployeeProfile";
import EmployeeDocuments from "@/pages/employee/EmployeeDocuments";
import EmployeeLeave from "@/pages/employee/EmployeeLeave";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: "admin" | "employee" }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && role !== requiredRole) {
    return <Navigate to={role === "admin" ? "/admin/dashboard" : "/employee/dashboard"} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={role === "admin" ? "/admin/dashboard" : "/employee/dashboard"} replace /> : <Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/" element={user ? <Navigate to={role === "admin" ? "/admin/dashboard" : "/employee/dashboard"} replace /> : <Navigate to="/login" replace />} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><DashboardLayout /></ProtectedRoute>}>
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="employees" element={<EmployeeList />} />
        <Route path="leaves" element={<AdminLeaves />} />
        <Route path="documents" element={<AdminDocuments />} />
        <Route path="profile" element={<AdminProfile />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Employee routes */}
      <Route path="/employee" element={<ProtectedRoute requiredRole="employee"><DashboardLayout /></ProtectedRoute>}>
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
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
