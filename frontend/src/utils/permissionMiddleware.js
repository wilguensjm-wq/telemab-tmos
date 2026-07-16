import { canAccessRoute } from "./permissions";

export function permissionMiddleware(user, routeConfig = {}) {
  return canAccessRoute(user, routeConfig);
}
