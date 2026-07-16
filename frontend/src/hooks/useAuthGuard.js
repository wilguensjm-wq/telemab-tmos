import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function useAuthGuard(requiredRoles = [], requiredPermissions = []) {
  const { user, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }

    if (requiredRoles.length > 0 && !requiredRoles.includes(user?.role)) {
      navigate("/403", { replace: true });
    }

    if (requiredPermissions.length > 0 && !requiredPermissions.every((permission) => user?.permissions?.includes(permission))) {
      navigate("/403", { replace: true });
    }
  }, [isAuthenticated, loading, navigate, requiredPermissions, requiredRoles, user?.permissions, user?.role]);

  return { isAuthenticated, user, loading };
}
