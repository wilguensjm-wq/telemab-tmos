import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { canAccessRoute } from "../utils/permissions";

export default function ProtectedRoute({ allowedRoles = [], requiredPermissions = [] }) {
  const auth = useAuth();
  const isAuthenticated = auth?.isAuthenticated;
  const user = auth?.user;
  const loading = auth?.loading;

  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessRoute(user, { allowedRoles, requiredPermissions })) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}
