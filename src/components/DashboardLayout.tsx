import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, Users, CalendarDays, FileText, User, LogOut, Settings, Loader2, Search, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLogo } from "@/components/AppLogo";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { PortalSearchProvider } from "@/contexts/PortalSearchContext";

const adminItems = [
  { title: "Dashboard", url: "", icon: LayoutDashboard },
  { title: "Employees", url: "/employees", icon: Users },
  { title: "Leave Requests", url: "/leaves", icon: CalendarDays },
  { title: "Attendance", url: "/attendance", icon: CalendarDays },
  { title: "My Profile", url: "/profile", icon: User },
  { title: "Settings", url: "/settings", icon: Settings },
];
const superAdminItems = [
  { title: "Company Approvals", url: "/super-admin/companies", icon: Users },
];

const employeeItems = [
  { title: "Dashboard", url: "/employee/dashboard", icon: LayoutDashboard },
  { title: "Profile", url: "/employee/profile", icon: User },
  { title: "Documents", url: "/employee/documents", icon: FileText },
  { title: "Leave", url: "/employee/leave", icon: CalendarDays },
  { title: "Settings", url: "/employee/settings", icon: Settings },
];

function AppSidebar() {
  const { role, signOut, user, companySlug } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const [signingOut, setSigningOut] = useState(false);
  const [companyName, setCompanyName] = useState("Company");
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const collapsed = state === "collapsed";
  const toCompanyUrl = (path: string) => (companySlug ? `/${companySlug}${path}` : path);
  const items = (role === "super_admin" ? superAdminItems : role === "admin" ? adminItems : employeeItems).map((item) => ({
    ...item,
    url: role === "super_admin" ? item.url : toCompanyUrl(item.url),
  }));

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (err: any) {
      toast({ title: "Sign out failed", description: err.message, variant: "destructive" });
    } finally {
      setSigningOut(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (role === "super_admin" || !companySlug) return;

    Promise.all([
      supabase
        .from("companies")
        .select("name, logo_url")
        .eq("slug", companySlug)
        .maybeSingle(),
      user?.id
        ? supabase
            .from("employee_profiles")
            .select("avatar_url")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]).then(([companyRes, profileRes]) => {
      if (!active) return;
      setCompanyName(companyRes.data?.name || "Company");
      setCompanyLogoUrl(companyRes.data?.logo_url || null);
      setUserAvatarUrl((profileRes as any)?.data?.avatar_url || null);
    });

    return () => {
      active = false;
    };
  }, [companySlug, role, user?.id]);

  const companyInitials = useMemo(() => {
    return companyName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "C";
  }, [companyName]);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarContent className="flex flex-col h-full">
        <div className="p-4">
          {role === "super_admin" ? (
            <AppLogo
              boxed
              className={collapsed ? "items-center" : ""}
              src="/branding/workflow-logo.png"
              imageClassName={collapsed ? "h-7 w-7" : "h-10 max-w-[180px]"}
              subtitle={collapsed ? undefined : "HR Portal"}
              subtitleClassName="text-sidebar-foreground/60"
            />
          ) : (
            <div className={collapsed ? "flex justify-center" : "flex items-center gap-3"}>
              {userAvatarUrl ? (
                <img src={userAvatarUrl} alt={user?.email || "Profile"} className="h-10 w-10 rounded-full object-cover border border-sidebar-border" />
              ) : companyLogoUrl ? (
                <img src={companyLogoUrl} alt={companyName} className="h-10 w-10 rounded-full object-cover border border-sidebar-border" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-sidebar-primary/20 text-sidebar-primary flex items-center justify-center text-sm font-semibold border border-sidebar-border">
                  {companyInitials}
                </div>
              )}
              {!collapsed && (
                <div>
                  <p className="text-sm font-semibold text-sidebar-foreground truncate max-w-[140px]">{companyName}</p>
                  <p className="text-xs text-sidebar-foreground/60">HR Portal</p>
                </div>
              )}
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>{role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "Menu"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className="hover:bg-sidebar-accent/80 rounded-xl" activeClassName="bg-primary text-primary-foreground font-medium shadow-lg shadow-blue-950/20 rounded-xl">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mt-auto p-3">
          {!collapsed && (
            <p className="text-xs text-sidebar-foreground/50 mb-2 truncate px-2">{user?.email}</p>
          )}
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "default"}
            className="w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent justify-start"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {!collapsed && <span className="ml-2">{signingOut ? "Signing out..." : "Sign out"}</span>}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export default function DashboardLayout() {
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    setSearchTerm("");
  }, [location.pathname]);

  return (
    <PortalSearchProvider value={{ searchTerm, setSearchTerm }}>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-[#F8F9FB] text-slate-900">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 md:px-8 shrink-0">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                <div className="hidden md:flex items-center gap-3 bg-slate-100 px-4 py-2 rounded-xl w-80">
                  <Search size={16} className="text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search..."
                    className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 text-sm"
                  />
                </div>
              </div>
              <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full relative">
                <Bell size={20} />
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
              </button>
            </header>
            <main className="flex-1 p-6 md:p-8 overflow-auto">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </PortalSearchProvider>
  );
}

