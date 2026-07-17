import test from "node:test";
import assert from "node:assert/strict";
import {
  isPublicRoute,
  resolveRequiredPermission,
  listProtectedV1RoutesFromSource,
  findUnmappedProtectedRoutes,
} from "./routeAuthorization.js";
import { PERMISSIONS } from "./permissionCatalog.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("isPublicRoute matches only explicit public endpoints", () => {
  assert.equal(isPublicRoute("POST", "/auth/login"), true);
  assert.equal(isPublicRoute("POST", "/auth/refresh"), true);
  assert.equal(isPublicRoute("GET", "/health"), true);
  assert.equal(isPublicRoute("POST", "/auth/logout"), false);
});

test("resolveRequiredPermission maps protected infrastructure actions deterministically", () => {
  assert.equal(resolveRequiredPermission("GET", "/infrastructure/proxmox/vms"), PERMISSIONS.INFRA_PROXMOX_READ);
  assert.equal(resolveRequiredPermission("POST", "/infrastructure/proxmox/vms/start"), PERMISSIONS.INFRA_PROXMOX_ACTION);
  assert.equal(resolveRequiredPermission("GET", "/providers/proxmox/vms/101/metrics"), PERMISSIONS.INFRA_PROXMOX_READ);
  assert.equal(resolveRequiredPermission("POST", "/providers/proxmox/vms/101/start"), PERMISSIONS.INFRA_PROXMOX_ACTION);
});

test("resolveRequiredPermission returns null for unmapped protected routes", () => {
  assert.equal(resolveRequiredPermission("GET", "/some/new/protected/endpoint"), null);
});

test("all protected v1 routes have explicit permission mappings", async () => {
  const authDir = path.dirname(fileURLToPath(import.meta.url));
  const routeSource = await readFile(path.resolve(authDir, "../routes/v1.js"), "utf8");
  const protectedRoutes = listProtectedV1RoutesFromSource(routeSource);
  const unmapped = findUnmappedProtectedRoutes(protectedRoutes);
  assert.deepEqual(unmapped, []);
});
