import { PERMISSIONS } from "./permissionCatalog.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function normalizePath(pathname = "/") {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function normalizeRoutePattern(pathname = "/") {
  return normalizePath(pathname)
    .replace(/:vmId/g, "101")
    .replace(/:action/g, "start");
}

const PUBLIC_ROUTES = Object.freeze([
  { method: "GET", path: "/health" },
  { method: "POST", path: "/auth/login" },
  { method: "POST", path: "/auth/refresh" },
]);

export function isPublicRoute(method, path) {
  const normalizedPath = normalizePath(path);
  return PUBLIC_ROUTES.some((route) => route.method === method && route.path === normalizedPath);
}

export function resolveRequiredPermission(method, path) {
  const normalizedPath = normalizePath(path);

  if (isPublicRoute(method, normalizedPath)) {
    return null;
  }

  if (normalizedPath === "/connectivity/vpn/readiness") return PERMISSIONS.CONNECTIVITY_READ;
  if (normalizedPath === "/providers/capabilities") return PERMISSIONS.PROVIDER_CAPABILITIES_READ;

  if (normalizedPath === "/auth/profile") return PERMISSIONS.AUTH_PROFILE_READ;
  if (normalizedPath === "/auth/sessions") return PERMISSIONS.AUTH_SESSIONS_READ;
  if (normalizedPath === "/auth/policies") return PERMISSIONS.AUTH_POLICIES_READ;
  if (normalizedPath === "/auth/logout") return PERMISSIONS.AUTH_LOGOUT;

  if (normalizedPath === "/iam/audit/logs") return PERMISSIONS.IAM_AUDIT_READ;
  if (normalizedPath === "/iam/users") return PERMISSIONS.IAM_USERS_READ;

  if (normalizedPath === "/operations/events") return PERMISSIONS.OPERATIONS_EVENTS_READ;
  if (normalizedPath === "/operations/overview") return PERMISSIONS.OPERATIONS_OVERVIEW_READ;
  if (normalizedPath === "/operations/timeline") return PERMISSIONS.OPERATIONS_TIMELINE_READ;
  if (normalizedPath === "/operations/changes") return PERMISSIONS.OPERATIONS_CHANGES_READ;

  if (normalizedPath === "/providers/state") return PERMISSIONS.PROVIDER_STATE_READ;
  if (normalizedPath === "/administration/settings") return PERMISSIONS.ADMIN_SETTINGS_READ;

  if (normalizedPath.startsWith("/providers/proxmox/")) {
    if (method === "POST") return PERMISSIONS.INFRA_PROXMOX_ACTION;
    return PERMISSIONS.INFRA_PROXMOX_READ;
  }

  if (normalizedPath.startsWith("/infrastructure/proxmox/")) {
    if (method === "POST") return PERMISSIONS.INFRA_PROXMOX_ACTION;
    return PERMISSIONS.INFRA_PROXMOX_READ;
  }

  if (normalizedPath.startsWith("/infrastructure/containers/")) {
    if (["/infrastructure/containers/start", "/infrastructure/containers/stop", "/infrastructure/containers/restart"].includes(normalizedPath)) {
      return PERMISSIONS.INFRA_CONTAINERS_ACTION;
    }
    return PERMISSIONS.INFRA_CONTAINERS_READ;
  }

  if (normalizedPath.startsWith("/infrastructure/monitoring/")) {
    if (["/infrastructure/monitoring/pause", "/infrastructure/monitoring/resume", "/infrastructure/monitoring/refresh", "/infrastructure/monitoring/acknowledge"].includes(normalizedPath)) {
      return PERMISSIONS.INFRA_MONITORING_ACTION;
    }
    return PERMISSIONS.INFRA_MONITORING_READ;
  }

  if (normalizedPath.startsWith("/infrastructure/proxy/")) {
    if (["/infrastructure/proxy/hosts/toggle", "/infrastructure/proxy/certificates/renew", "/infrastructure/proxy/reload"].includes(normalizedPath)) {
      return PERMISSIONS.INFRA_PROXY_ACTION;
    }
    return PERMISSIONS.INFRA_PROXY_READ;
  }

  if (normalizedPath.startsWith("/streaming/")) {
    if (["/streaming/endpoints/failover", "/streaming/endpoints/refresh"].includes(normalizedPath)) {
      return PERMISSIONS.STREAMING_ACTION;
    }
    return PERMISSIONS.STREAMING_READ;
  }

  if (normalizedPath.startsWith("/broadcast/")) {
    if (normalizedPath === "/broadcast/master-control/takeover") {
      return PERMISSIONS.BROADCAST_ACTION;
    }
    return PERMISSIONS.BROADCAST_READ;
  }

  if (normalizedPath === "/infrastructure/noc/overview") return PERMISSIONS.INFRA_NOC_READ;
  if (normalizedPath === "/infrastructure/ubuntu/servers") return PERMISSIONS.INFRA_UBUNTU_READ;
  if (normalizedPath === "/infrastructure/storage/volumes") return PERMISSIONS.INFRA_STORAGE_READ;
  if (normalizedPath === "/infrastructure/network/links") return PERMISSIONS.INFRA_NETWORK_READ;
  if (normalizedPath === "/infrastructure/ffmpeg/jobs") return PERMISSIONS.INFRA_FFMPEG_READ;
  if (normalizedPath === "/media/library/assets") return PERMISSIONS.MEDIA_LIBRARY_READ;
  if (normalizedPath.startsWith("/ai/operations/")) return PERMISSIONS.AI_OPERATIONS_READ;

  return null;
}

function extractRoutesFromArrayBlock(source, arrayName, method) {
  const pattern = new RegExp(`const ${arrayName} = \\[(.*?)\\];`, "s");
  const match = source.match(pattern);
  if (!match) {
    return [];
  }

  const routes = [];
  const pathRegex = /\["([^"]+)"\s*,/g;
  let routeMatch = pathRegex.exec(match[1]);
  while (routeMatch) {
    routes.push({ method, path: routeMatch[1] });
    routeMatch = pathRegex.exec(match[1]);
  }
  return routes;
}

export function listV1RoutesFromSource(source) {
  const routes = [];
  const directRegex = /router\.(get|post)\("([^"]+)"/g;
  let routeMatch = directRegex.exec(source);
  while (routeMatch) {
    routes.push({
      method: routeMatch[1].toUpperCase(),
      path: routeMatch[2],
    });
    routeMatch = directRegex.exec(source);
  }

  routes.push(...extractRoutesFromArrayBlock(source, "unavailableGetRoutes", "GET"));
  routes.push(...extractRoutesFromArrayBlock(source, "unavailablePostRoutes", "POST"));

  const deduped = new Map();
  for (const route of routes) {
    const normalizedPath = normalizeRoutePattern(route.path);
    const key = `${route.method} ${normalizedPath}`;
    if (!deduped.has(key)) {
      deduped.set(key, { method: route.method, path: normalizedPath });
    }
  }

  return [...deduped.values()];
}

export function listProtectedV1RoutesFromSource(source) {
  return listV1RoutesFromSource(source).filter((route) => !isPublicRoute(route.method, route.path));
}

export function findUnmappedProtectedRoutes(routes) {
  return routes.filter((route) => !resolveRequiredPermission(route.method, route.path));
}

export async function assertNoUnmappedProtectedV1Routes() {
  const authDir = path.dirname(fileURLToPath(import.meta.url));
  const routeFilePath = path.resolve(authDir, "../routes/v1.js");
  const source = await readFile(routeFilePath, "utf8");
  const protectedRoutes = listProtectedV1RoutesFromSource(source);
  const unmappedRoutes = findUnmappedProtectedRoutes(protectedRoutes);

  if (unmappedRoutes.length > 0) {
    const detail = unmappedRoutes
      .map((route) => `${route.method} ${route.path}`)
      .join(", ");
    throw new Error(`Unmapped protected routes detected: ${detail}`);
  }

  return protectedRoutes;
}
