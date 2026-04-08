import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { SUPABASE_AUTH_STORAGE_KEY, supabase } from "@/integrations/supabase/client";
import { SUPABASE_REQUEST_TIMEOUT_MS, isAsyncTimeoutError, withTimeout } from "@/lib/async";

type AppRole = "admin" | "employee";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const DEFAULT_AUTH_CONTEXT: AuthContextType = {
  session: null,
  user: null,
  role: null,
  loading: true,
  signIn: async () => {
    throw new Error("Authentication is not ready yet. Reload the page and try again.");
  },
  signOut: async () => {},
};

const AuthContext = createContext<AuthContextType>(DEFAULT_AUTH_CONTEXT);

const ROLE_CACHE_KEY = "mtlhr:role-cache";

const clearLocalAuthCache = () => {
  if (typeof window === "undefined") return;

  const keysToRemove = Object.keys(window.localStorage).filter((key) =>
    key === ROLE_CACHE_KEY || key.startsWith(SUPABASE_AUTH_STORAGE_KEY),
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

const getCachedRole = (userId: string) => getCachedRoles()[userId] ?? null;

const setCachedRole = (userId: string, role: AppRole) => {
  if (typeof window === "undefined") return;

  const roles = getCachedRoles();
  roles[userId] = role;
  window.localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(roles));
};

const getFallbackRole = (user: User | null) => {
  const metadataRole = user?.user_metadata?.role;
  return metadataRole === "admin" || metadataRole === "employee" ? metadataRole : null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    let isActive = true;

    const applySession = (nextSession: Session | null) => {
      if (!isActive) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setRole(null);
        setRoleLoading(false);
        return;
      }

      const fallbackRole = getCachedRole(nextSession.user.id) ?? getFallbackRole(nextSession.user);
      setRole(fallbackRole);
      setRoleLoading(!fallbackRole);
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
      setRoleLoading(false);
      return;
    }

    const fallbackRole = getCachedRole(user.id) ?? getFallbackRole(user);
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
        const resolvedRole = roles.includes("admin")
          ? "admin"
          : roles.includes("employee")
            ? "employee"
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

    return () => {
      isActive = false;
    };
  }, [user]);

  const loading = useMemo(() => authLoading || (!!user && roleLoading), [authLoading, roleLoading, user]);

  const signIn = async (email: string, password: string) => {
    const { error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      SUPABASE_REQUEST_TIMEOUT_MS,
      "Sign in",
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
    setRoleLoading(false);
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
