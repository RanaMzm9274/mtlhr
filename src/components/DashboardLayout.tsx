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
import { LayoutDashboard, Users, CalendarDays, FileText, User, LogOut, Settings, Loader2, Search, Bell, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLogo } from "@/components/AppLogo";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { PortalSearchProvider } from "@/contexts/PortalSearchContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const adminItems = [
  { title: "Dashboard", url: "", icon: LayoutDashboard },
  { title: "Employees", url: "/employees", icon: Users },
  { title: "Leave Requests", url: "/leaves", icon: CalendarDays },
  { title: "Attendance", url: "/attendance", icon: CalendarDays },
  { title: "Messages", url: "/messages", icon: MessageCircle },
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
  { title: "Messages", url: "/employee/messages", icon: MessageCircle },
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

    supabase
      .from("companies")
      .select("name, logo_url")
      .eq("slug", companySlug)
      .maybeSingle()
      .then((companyRes) => {
      if (!active) return;
      setCompanyName(companyRes.data?.name || "Company");
      setCompanyLogoUrl(companyRes.data?.logo_url || null);
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
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar overflow-x-hidden">
      <SidebarContent className="flex flex-col h-full overflow-x-hidden">
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 min-w-0">
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
              <div className={collapsed ? "flex justify-center min-w-0" : "flex flex-col items-start gap-2 min-w-0"}>
                <div
                  className={
                    collapsed
                      ? "h-9 w-9 rounded-md border border-sidebar-border bg-white/5 flex items-center justify-center overflow-hidden"
                      : "h-14 w-full max-w-[160px] rounded-md border border-sidebar-border bg-white/5 flex items-center justify-center overflow-hidden shrink-0"
                  }
                >
                  {companyLogoUrl ? (
                    <img
                      src={companyLogoUrl}
                      alt={companyName}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                  <div className="h-full w-full bg-sidebar-primary/20 text-sidebar-primary flex items-center justify-center text-sm font-semibold">
                    {companyInitials}
                  </div>
                  )}
                </div>
                {!collapsed && (
                  <div className="w-full">
                    <p className="text-sm font-semibold text-sidebar-foreground break-words leading-tight">{companyName}</p>
                    <p className="text-xs text-sidebar-foreground/60">HR Portal</p>
                  </div>
                )}
              </div>
            )}
            <SidebarTrigger className="h-8 w-8 shrink-0 rounded-md border border-sidebar-border text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" />
          </div>
        </div>

        <SidebarGroup className={collapsed ? "px-1" : "px-2"}>
          <SidebarGroupLabel>{role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "Menu"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className={collapsed ? "justify-center" : ""}>
                    <NavLink
                      to={item.url}
                      end
                      className={`hover:bg-sidebar-accent/80 rounded-xl ${collapsed ? "justify-center" : ""}`}
                      activeClassName={`bg-primary text-primary-foreground font-medium shadow-lg shadow-blue-950/20 rounded-xl ${collapsed ? "justify-center" : ""}`}
                    >
                      <item.icon className={collapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
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
            className={`w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent ${collapsed ? "justify-center" : "justify-start"}`}
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
  const { user } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const isMessagesRoute = location.pathname.endsWith("/messages");
  const [notifications, setNotifications] = useState<Array<{ id: string; text: string; createdAt: string; read: boolean }>>([]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  useEffect(() => {
    setSearchTerm("");
  }, [location.pathname]);

  useEffect(() => {
    if (!user?.id) return;

    const pushNotification = (text: string) => {
      const next = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        createdAt: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [next, ...prev].slice(0, 30));
    };

    const channel = supabase
      .channel(`header-notifications-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, async (payload) => {
        const message = payload.new as any;
        if (!message?.conversation_id || message?.sender_id === user.id) return;
        const { data: membership } = await supabase
          .from("chat_participants")
          .select("id")
          .eq("conversation_id", message.conversation_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!membership) return;
        pushNotification("You received a new message.");
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "employee_profiles", filter: `user_id=eq.${user.id}` },
        () => {
          pushNotification("Your profile was updated by admin.");
          toast({ title: "Profile updated", description: "Your profile details were updated." });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })));
  };

  return (
    <PortalSearchProvider value={{ searchTerm, setSearchTerm }}>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-[#F8F9FB] text-slate-900">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            {!isMessagesRoute ? (
              <header className="h-20 bg-white border-b border-slate-200 shrink-0">
                <div className="h-full w-full px-4 sm:px-6 md:px-8 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="hidden md:flex items-center gap-3 bg-slate-100 px-4 py-2 rounded-xl w-80 max-w-full">
                    <Search size={16} className="text-slate-400" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search..."
                      className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 text-sm"
                    />
                  </div>
                </div>
                <DropdownMenu onOpenChange={(open) => { if (open) markAllNotificationsRead(); }}>
                  <DropdownMenuTrigger asChild>
                    <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full relative" aria-label="Notifications">
                      <Bell size={20} />
                      {unreadCount > 0 ? (
                        <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                      ) : null}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {notifications.length === 0 ? (
                      <DropdownMenuItem disabled>No new notifications.</DropdownMenuItem>
                    ) : (
                      notifications.slice(0, 10).map((notification) => (
                        <DropdownMenuItem key={notification.id} className="block whitespace-normal">
                          <div className="text-sm">{notification.text}</div>
                          <div className="text-xs text-slate-500">{new Date(notification.createdAt).toLocaleString()}</div>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
              </header>
            ) : null}
            <main className={isMessagesRoute ? "flex-1 overflow-hidden p-0" : "flex-1 overflow-auto"}>
              {isMessagesRoute ? (
                <Outlet />
              ) : (
                <div className="w-full px-4 sm:px-6 md:px-8 py-6 md:py-8">
                  <Outlet />
                </div>
              )}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </PortalSearchProvider>
  );
}

