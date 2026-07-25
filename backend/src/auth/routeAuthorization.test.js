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

test("resolveRequiredPermission maps reporter control room CRUD routes", () => {
  assert.equal(resolveRequiredPermission("GET", "/reporters"), PERMISSIONS.REPORTERS_READ);
  assert.equal(resolveRequiredPermission("PATCH", "/reporters/rep-1"), PERMISSIONS.REPORTERS_WRITE);
  assert.equal(resolveRequiredPermission("GET", "/studios/stu-1"), PERMISSIONS.STUDIOS_READ);
  assert.equal(resolveRequiredPermission("DELETE", "/studios/stu-1"), PERMISSIONS.STUDIOS_WRITE);
  assert.equal(resolveRequiredPermission("GET", "/assignments/asg-1"), PERMISSIONS.ASSIGNMENTS_READ);
  assert.equal(resolveRequiredPermission("POST", "/assignments"), PERMISSIONS.ASSIGNMENTS_WRITE);
});

test("resolveRequiredPermission maps presence routes", () => {
  assert.equal(resolveRequiredPermission("GET", "/presence/reporters"), PERMISSIONS.PRESENCE_READ);
  assert.equal(resolveRequiredPermission("GET", "/presence/reporters/rep-1"), PERMISSIONS.PRESENCE_READ);
  assert.equal(resolveRequiredPermission("POST", "/presence/reporters/rep-1/override"), PERMISSIONS.PRESENCE_OVERRIDE);
});

test("resolveRequiredPermission maps media abstraction routes", () => {
  assert.equal(resolveRequiredPermission("GET", "/media/providers/capabilities"), PERMISSIONS.MEDIA_CAPABILITIES_READ);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions"), PERMISSIONS.MEDIA_SESSION_CREATE);
  assert.equal(resolveRequiredPermission("GET", "/media/sessions"), PERMISSIONS.MEDIA_SESSION_READ);
  assert.equal(resolveRequiredPermission("GET", "/media/sessions/session-1"), PERMISSIONS.MEDIA_SESSION_READ);
  assert.equal(resolveRequiredPermission("PATCH", "/media/sessions/session-1"), PERMISSIONS.MEDIA_SESSION_UPDATE);
  assert.equal(resolveRequiredPermission("DELETE", "/media/sessions/session-1"), PERMISSIONS.MEDIA_SESSION_CLOSE);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/session-1/participants"), PERMISSIONS.MEDIA_PARTICIPANT_MANAGE);
  assert.equal(resolveRequiredPermission("DELETE", "/media/sessions/session-1/participants/participant-1"), PERMISSIONS.MEDIA_PARTICIPANT_MANAGE);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/session-1/mute"), PERMISSIONS.MEDIA_PARTICIPANT_MANAGE);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/session-1/unmute"), PERMISSIONS.MEDIA_PARTICIPANT_MANAGE);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/session-1/promote"), PERMISSIONS.MEDIA_PARTICIPANT_MANAGE);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/session-1/demote"), PERMISSIONS.MEDIA_PARTICIPANT_MANAGE);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/session-1/transfer"), PERMISSIONS.MEDIA_PRODUCER_TRANSFER);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/session-1/readiness"), PERMISSIONS.MEDIA_SESSION_READINESS_WRITE);
  assert.equal(resolveRequiredPermission("GET", "/media/sessions/session-1/readiness"), PERMISSIONS.MEDIA_SESSION_READINESS_READ);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/session-1/go-live"), PERMISSIONS.MEDIA_SESSION_LIVE_CONTROL);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/session-1/stop-live"), PERMISSIONS.MEDIA_SESSION_LIVE_CONTROL);
  assert.equal(resolveRequiredPermission("GET", "/media/rooms"), PERMISSIONS.MEDIA_ROOMS_READ);
  assert.equal(resolveRequiredPermission("POST", "/media/rooms"), PERMISSIONS.MEDIA_ROOMS_WRITE);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/join"), PERMISSIONS.MEDIA_SESSION_JOIN);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/part-1/leave"), PERMISSIONS.MEDIA_SESSION_LEAVE);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/part-1/devices"), PERMISSIONS.MEDIA_DEVICE_SELECT);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/part-1/publisher"), PERMISSIONS.MEDIA_PUBLISHER_CONTROL);
  assert.equal(resolveRequiredPermission("POST", "/media/sessions/part-1/producer-control"), PERMISSIONS.MEDIA_PRODUCER_CONTROL);
});

test("resolveRequiredPermission maps broadcast engine routes", () => {
  assert.equal(resolveRequiredPermission("GET", "/broadcast/status"), PERMISSIONS.BROADCAST_READ);
  assert.equal(resolveRequiredPermission("POST", "/broadcast/start"), PERMISSIONS.BROADCAST_ACTION);
  assert.equal(resolveRequiredPermission("POST", "/broadcast/stop"), PERMISSIONS.BROADCAST_ACTION);
  assert.equal(resolveRequiredPermission("POST", "/broadcast/restart"), PERMISSIONS.BROADCAST_ACTION);
  assert.equal(resolveRequiredPermission("POST", "/broadcast/refresh"), PERMISSIONS.BROADCAST_ACTION);
  assert.equal(resolveRequiredPermission("PATCH", "/broadcast/program"), PERMISSIONS.BROADCAST_ACTION);
  assert.equal(resolveRequiredPermission("POST", "/broadcast/record/start"), PERMISSIONS.BROADCAST_ACTION);
  assert.equal(resolveRequiredPermission("POST", "/broadcast/record/stop"), PERMISSIONS.BROADCAST_ACTION);
  assert.equal(resolveRequiredPermission("POST", "/broadcast/output/rtmp"), PERMISSIONS.BROADCAST_ACTION);
  assert.equal(resolveRequiredPermission("POST", "/broadcast/output/srt"), PERMISSIONS.BROADCAST_ACTION);
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
