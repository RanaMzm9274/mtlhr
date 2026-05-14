import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { SUPABASE_AUTH_STORAGE_KEY, supabase } from "@/integrations/supabase/client";
import { SUPABASE_REQUEST_TIMEOUT_MS, isAsyncTimeoutError, withTimeout } from "@/lib/async";

type AppRole = "super_admin" | "admin" | "employee";
type CompanyStatus = "pending" | "approved" | "rejected" | null;
const SUPER_ADMIN_EMAILS = new Set(["moazam@mtlondon.tech"]);

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  companyStatus: CompanyStatus;
  companySlug: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUpCompany: (payload: { name: string; email: string; password: string; companyName: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const DEFAULT_AUTH_CONTEXT: AuthContextType = {
  session: null,
  user: null,
  role: null,
  companyStatus: null,
  companySlug: null,
  loading: true,
  signIn: async () => {
    throw new Error("Authentication is not ready yet. Reload the page and try again.");
  },
  signUpCompany: async () => {
    throw new Error("Authentication is not ready yet. Reload the page and try again.");
  },
  signOut: async () => {},
};

const AuthContext = createContext<AuthContextType>(DEFAULT_AUTH_CONTEXT);

const ROLE_CACHE_KEY = "mtlhr:role-cache";
const COMPANY_STATUS_CACHE_KEY = "mtlhr:company-status-cache";
const COMPANY_SLUG_CACHE_KEY = "mtlhr:company-slug-cache";

const clearLocalAuthCache = () => {
  if (typeof window === "undefined") return;

  const keysToRemove = Object.keys(window.localStorage).filter((key) =>
    key === ROLE_CACHE_KEY || key === COMPANY_STATUS_CACHE_KEY || key === COMPANY_SLUG_CACHE_KEY || key.startsWith(SUPABASE_AUTH_STORAGE_KEY),
  );

  for (const key of keysToRemove) {
    window.localStorage.removeItem(key);
  }
};

const getCachedRoles = () => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(ROLE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed as Record<string, AppRole> : {};
  } catch {
    return {};
  }
};

const getCachedCompanyStatuses = () => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(COMPANY_STATUS_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed as Record<string, CompanyStatus> : {};
  } catch {
    return {};
  }
};
const getCachedCompanySlugs = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COMPANY_SLUG_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed as Record<string, string | null> : {};
  } catch {
    return {};
  }
};

const getCachedRole = (userId: string) => getCachedRoles()[userId] ?? null;
const getCachedCompanyStatus = (userId: string) => getCachedCompanyStatuses()[userId] ?? null;
const getCachedCompanySlug = (userId: string) => getCachedCompanySlugs()[userId] ?? null;

const setCachedRole = (userId: string, role: AppRole) => {
  if (typeof window === "undefined") return;

  const roles = getCachedRoles();
  roles[userId] = role;
  window.localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(roles));
};

const setCachedCompanyStatus = (userId: string, companyStatus: CompanyStatus) => {
  if (typeof window === "undefined") return;

  const statuses = getCachedCompanyStatuses();
  statuses[userId] = companyStatus;
  window.localStorage.setItem(COMPANY_STATUS_CACHE_KEY, JSON.stringify(statuses));
};
const setCachedCompanySlug = (userId: string, companySlug: string | null) => {
  if (typeof window === "undefined") return;
  const slugs = getCachedCompanySlugs();
  slugs[userId] = companySlug;
  window.localStorage.setItem(COMPANY_SLUG_CACHE_KEY, JSON.stringify(slugs));
};

const getFallbackRole = (user: User | null) => {
  const email = user?.email?.toLowerCase();
  if (email && SUPER_ADMIN_EMAILS.has(email)) return "super_admin";
  const metadataRole = user?.user_metadata?.role;
  return metadataRole === "super_admin" || metadataRole === "admin" || metadataRole === "employee" ? metadataRole : null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [companyStatus, setCompanyStatus] = useState<CompanyStatus>(null);
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);

  useEffect(() => {
    let isActive = true;

    const applySession = (nextSession: Session | null) => {
      if (!isActive) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setRole(null);
        setCompanyStatus(null);
        setCompanySlug(null);
        setRoleLoading(false);
        setCompanyLoading(false);
        return;
      }

      const fallbackRole = getCachedRole(nextSession.user.id) ?? getFallbackRole(nextSession.user);
      const fallbackCompanyStatus = getCachedCompanyStatus(nextSession.user.id);
      const fallbackCompanySlug = getCachedCompanySlug(nextSession.user.id);
      setRole(fallbackRole);
      setCompanyStatus(fallbackCompanyStatus);
      setCompanySlug(fallbackCompanySlug);
      setRoleLoading(!fallbackRole);
      setCompanyLoading(true);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
      setAuthLoading(false);
    });

    withTimeout(supabase.auth.getSession(), SUPABASE_REQUEST_TIMEOUT_MS, "Auth session bootstrap")
      .then(({ data: { session: nextSession } }) => {
        applySession(nextSession);
      })
      .catch((err) => {
        if (!isActive) return;
        if (isAsyncTimeoutError(err)) {
          clearLocalAuthCache();
        } else {
          console.error("Failed to get initial session:", err);
        }
        setSession(null);
        setUser(null);
        setRole(null);
        setCompanyStatus(null);
        setCompanySlug(null);
        setRoleLoading(false);
      })
      .finally(() => {
        if (isActive) {
          setAuthLoading(false);
        }
      });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!user) {
      setRole(null);
      setCompanyStatus(null);
      setCompanySlug(null);
      setRoleLoading(false);
      setCompanyLoading(false);
      return;
    }

    const fallbackRole = getCachedRole(user.id) ?? getFallbackRole(user);
    const isWhitelistedSuperAdmin = !!user.email && SUPER_ADMIN_EMAILS.has(user.email.toLowerCase());
    if (fallbackRole) {
      setRole(fallbackRole);
    }
    setRoleLoading(!fallbackRole);

    withTimeout(
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id),
      SUPABASE_REQUEST_TIMEOUT_MS,
      "Role fetch",
    )
      .then(({ data, error }) => {
        if (!isActive) return;

        if (error) {
          console.error("Failed to fetch user roles:", error);
          setRole(fallbackRole ?? "employee");
          return;
        }

        const roles = (data ?? []).map((item) => item.role as AppRole);
        // Enforce employee isolation: if employee role exists, treat account as employee
        // unless explicitly super admin.
        const resolvedRole = isWhitelistedSuperAdmin || roles.includes("super_admin")
          ? "super_admin"
          : roles.includes("employee")
            ? "employee"
            : roles.includes("admin")
              ? "admin"
              : fallbackRole ?? "employee";

        setRole(resolvedRole);
        setCachedRole(user.id, resolvedRole);
      })
      .catch((err) => {
        if (!isActive) return;
        if (!isAsyncTimeoutError(err)) {
          console.error("Unexpected role fetch error:", err);
        }
        setRole(getCachedRole(user.id) ?? getFallbackRole(user) ?? "employee");
      })
      .finally(() => {
        if (isActive) {
          setRoleLoading(false);
        }
      });

    withTimeout(
      supabase
        .from("company_memberships")
        .select("status, company_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1),
      SUPABASE_REQUEST_TIMEOUT_MS,
      "Company status fetch",
    )
      .then(async ({ data, error }) => {
        if (!isActive) return;
        if (error) {
          setCompanyLoading(false);
          return;
        }
        if (isWhitelistedSuperAdmin) {
          setCompanyStatus("approved");
          setCompanySlug(null);
          setCachedCompanyStatus(user.id, "approved");
          setCachedCompanySlug(user.id, null);
          setCompanyLoading(false);
          return;
        }

        const membershipStatus = (data?.[0]?.status as CompanyStatus | undefined) ?? null;
        const membershipCompanyId = (data?.[0] as { company_id?: string | null } | undefined)?.company_id ?? null;

        let companyId = membershipCompanyId;
        if (!companyId) {
          const { data: profileRow } = await supabase
            .from("employee_profiles")
            .select("company_id")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          companyId = profileRow?.company_id ?? null;
        }

        let nextStatus: CompanyStatus = membershipStatus;
        let nextSlug: string | null = null;
        if (companyId) {
          const { data: companyRow } = await supabase
            .from("companies")
            .select("status, slug")
            .eq("id", companyId)
            .maybeSingle();
          if (companyRow?.status === "approved") {
            nextStatus = "approved";
          }
          nextSlug = companyRow?.slug ?? null;
        }

        setCompanyStatus(nextStatus);
        setCompanySlug(nextSlug);
        setCachedCompanyStatus(user.id, nextStatus);
        setCachedCompanySlug(user.id, nextSlug);
        setCompanyLoading(false);
      })
      .catch(() => {
        if (isActive) {
          setCompanyLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [user]);

  const loading = useMemo(() => authLoading || (!!user && (roleLoading || companyLoading)), [authLoading, roleLoading, companyLoading, user]);

  const signIn = async (email: string, password: string) => {
    const { error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      SUPABASE_REQUEST_TIMEOUT_MS,
      "Sign in",
    );
    if (error) throw error;
  };

  const signUpCompany = async (payload: { name: string; email: string; password: string; companyName: string }) => {
    const { error } = await withTimeout(
      supabase.auth.signUp({
        email: payload.email,
        password: payload.password,
        options: {
          data: {
            name: payload.name,
            company_name: payload.companyName,
          },
        },
      }),
      SUPABASE_REQUEST_TIMEOUT_MS,
      "Company sign up",
    );
    if (error) throw error;
  };

  const signOut = async () => {
    try {
      const { error } = await withTimeout(
        supabase.auth.signOut({ scope: "local" }),
        SUPABASE_REQUEST_TIMEOUT_MS,
        "Sign out",
      );
      if (error) throw error;
    } finally {
      clearLocalAuthCache();
    }
    setSession(null);
    setUser(null);
    setRole(null);
    setCompanyStatus(null);
    setCompanySlug(null);
    setRoleLoading(false);
  };

  return (
    <AuthContext.Provider value={{ session, user, role, companyStatus, companySlug, loading, signIn, signUpCompany, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
