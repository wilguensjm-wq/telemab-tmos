import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authService } from "../services/authService";
import { getStoredUser, clearStoredAuth } from "../utils/storage";
import { handleSessionTimeout, getSessionTimeoutRemaining } from "../utils/session";

const devAuthBypassEnabled = import.meta.env.TMOS_DEV_AUTH_BYPASS === "true";
const devAuthBypassCredentials = {
  username: "operator",
  password: "operator",
  rememberMe: true,
};

const defaultAuthContextValue = {
  user: null,
  loading: false,
  login: async () => ({ success: false, error: "Auth provider unavailable" }),
  logout: async () => {},
  isAuthenticated: false,
  hasRole: () => false,
  hasAnyRole: () => false,
  token: null,
  sessionStartedAt: 0,
};

const AuthContext = createContext(defaultAuthContextValue);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(true);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const loadingGuard = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
      }
    }, 12000);

    async function initializeAuth() {
      setLoading(true);
      try {
        if (devAuthBypassEnabled) {
          const payload = await authService.login(devAuthBypassCredentials);
          if (!cancelled) {
            const nextUser = {
              ...payload.user,
              accessToken: payload.accessToken,
              refreshToken: payload.refreshToken,
            };
            setUser(nextUser);
            setSessionStartedAt(Date.now());
          }
          return;
        }

        const result = await authService.verifyToken();
        if (result?.valid && result?.user) {
          setUser(result.user);
          setSessionStartedAt(Date.now());
        } else {
          clearStoredAuth();
          setUser(null);
        }
      } catch (error) {
        clearStoredAuth();
        setUser(null);
      } finally {
        clearTimeout(loadingGuard);
        setLoading(false);
      }
    }

    initializeAuth();

    return () => {
      cancelled = true;
      clearTimeout(loadingGuard);
    };
  }, []);

  const login = async (credentials) => {
    setLoading(true);
    try {
      const payload = await authService.login(credentials);
      const nextUser = { ...payload.user, accessToken: payload.accessToken, refreshToken: payload.refreshToken };
      setUser(nextUser);
      setSessionStartedAt(Date.now());
      return payload;
    } catch (error) {
      clearStoredAuth();
      setUser(null);
      return { success: false, error: error?.message || "Authentication failed" };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      // Ignore logout errors and still clear local auth state.
    } finally {
      clearStoredAuth();
      setUser(null);
    }
  };

  useEffect(() => {
    const remaining = getSessionTimeoutRemaining(sessionStartedAt);

    if (!user || remaining > 0) {
      return undefined;
    }

    handleSessionTimeout();
    return undefined;
  }, [sessionStartedAt, user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      isAuthenticated: Boolean(user),
      hasRole: (role) => user?.role === role,
      hasAnyRole: (roles = []) => roles.includes(user?.role),
      token: user?.accessToken || null,
      sessionStartedAt,
    }),
    [user, loading, sessionStartedAt],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext) || defaultAuthContextValue;
}
