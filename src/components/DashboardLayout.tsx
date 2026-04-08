import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
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
import { LayoutDashboard, Users, CalendarDays, FileText, User, LogOut, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLogo } from "@/components/AppLogo";
import { useToast } from "@/hooks/use-toast";

const adminItems = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Employees", url: "/admin/employees", icon: Users },
  { title: "Leave Requests", url: "/admin/leaves", icon: CalendarDays },
  { title: "Documents", url: "/admin/documents", icon: FileText },
  { title: "My Profile", url: "/admin/profile", icon: User },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

const employeeItems = [
  { title: "Dashboard", url: "/employee/dashboard", icon: LayoutDashboard },
  { title: "Profile", url: "/employee/profile", icon: User },
  { title: "Documents", url: "/employee/documents", icon: FileText },
  { title: "Leave", url: "/employee/leave", icon: CalendarDays },
  { title: "Settings", url: "/employee/settings", icon: Settings },
];

function AppSidebar() {
  const { role, signOut, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const [signingOut, setSigningOut] = useState(false);
  const collapsed = state === "collapsed";
  const items = role === "admin" ? adminItems : employeeItems;

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

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="flex flex-col h-full">
        <div className="p-4">
          <AppLogo
            boxed
            className={collapsed ? "items-center" : ""}
            imageClassName={collapsed ? "h-7 w-7" : "h-10 max-w-[180px]"}
            subtitle={collapsed ? undefined : "HR Portal"}
            subtitleClassName="text-sidebar-foreground/60"
          />
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>{role === "admin" ? "Admin" : "Menu"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
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
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b bg-card px-4 shrink-0">
            <SidebarTrigger />
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
