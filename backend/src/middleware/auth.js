import { TmosError } from "../errors/TmosError.js";
import { authService } from "../services/authService.js";

export function requireAuth(req, _res, next) {
  const authHeader = req.header("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const session = authService.verifyToken(token);
  if (!session.valid) {
    return next(new TmosError({
      code: "AUTH_FORBIDDEN",
      message: "Authentication required",
      status: 401,
    }));
  }

  req.operator = session.user;
  next();
}

export function requireRole(roles = []) {
  return function roleGuard(req, _res, next) {
    if (!roles.length || roles.includes(req.operator?.role)) {
      return next();
    }

    return next(new TmosError({
      code: "RBAC_DENIED",
      message: "Insufficient permissions",
      status: 403,
    }));
  };
}