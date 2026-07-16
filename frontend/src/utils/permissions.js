import { hasPermission } from "../constants/permissions";
import { ROLES } from "./roles";

export function canAccess(user, permission) {
  return hasPermission(user, permission);
}

export function canAccessRoute(user, { allowedRoles = [], requiredPermissions = [] } = {}) {
  if (!user) return false;

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return false;
  }

  if (requiredPermissions.length > 0 && !requiredPermissions.every((permission) => canAccess(user, permission))) {
    return false;
  }

  return true;
}

export function isAdministrator(user) {
  return user?.role === ROLES.ADMINISTRATOR;
}
