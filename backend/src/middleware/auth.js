import { TmosError } from "../errors/TmosError.js";

let authServiceRef;
let authorizationServiceRef;
let auditServiceRef;

export function setAuthService(authService) {
  authServiceRef = authService;
}

export function setAuthorizationDependencies({ authService, authorizationService, auditService }) {
  authServiceRef = authService;
  authorizationServiceRef = authorizationService;
  auditServiceRef = auditService;
}

export async function requireAuth(req, _res, next) {
  if (!authServiceRef) {
    return next(new TmosError({
      code: "INTERNAL_ERROR",
      message: "Authentication service is not initialized",
      status: 500,
    }));
  }

  const authHeader = req.header("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  try {
    const session = await authServiceRef.verifyToken(token);
    if (!session.valid) {
      return next(new TmosError({
        code: "AUTH_FORBIDDEN",
        message: "Invalid or expired access token",
        status: 401,
      }));
    }

    req.operator = session.user;
    next();
  } catch (error) {
    return next(error);
  }
}

async function recordAuthorizationDecision(req, permissionKey, decision) {
  if (!auditServiceRef) {
    return;
  }

  await auditServiceRef.record({
    actor: req.operator?.username || req.operator?.name || "unknown",
    action: "authz.decision",
    target: `${req.method} ${req.path}`,
    result: decision.allowed ? "success" : "failure",
    provider: "tmos",
    correlationId: req.correlationId,
    metadata: {
      permissionKey,
      method: req.method,
      path: req.path,
      allowed: decision.allowed,
      reason: decision.reason,
      roles: decision.roles,
    },
  });
}

export function requirePermission(permissionKey) {
  return async function permissionGuard(req, _res, next) {
    if (!authorizationServiceRef) {
      return next(new TmosError({
        code: "INTERNAL_ERROR",
        message: "Authorization service is not initialized",
        status: 500,
      }));
    }

    if (!req.operator?.id) {
      return next(new TmosError({
        code: "AUTH_FORBIDDEN",
        message: "Invalid or expired access token",
        status: 401,
      }));
    }

    try {
      const decision = await authorizationServiceRef.evaluate({
        user: req.operator,
        permissionKey,
      });
      await recordAuthorizationDecision(req, permissionKey, decision);
      if (decision.allowed) {
        return next();
      }

      return next(new TmosError({
        code: "RBAC_DENIED",
        message: "Insufficient permissions",
        status: 403,
        details: { permission: permissionKey },
      }));
    } catch (error) {
      return next(error);
    }
  };
}