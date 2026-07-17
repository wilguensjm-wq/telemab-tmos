import test from "node:test";
import assert from "node:assert/strict";
import { AuthorizationService } from "./authorizationService.js";
import { PERMISSIONS } from "../auth/permissionCatalog.js";

test("evaluate grants access when explicit permission exists", async () => {
  const service = new AuthorizationService({
    rbacRepository: {
      listRoleKeysForUser: async () => ["Operator"],
      listPermissionKeysForUser: async () => [PERMISSIONS.SYSTEM_AUTHENTICATED, PERMISSIONS.INFRA_PROXMOX_READ],
    },
  });

  const decision = await service.evaluate({
    user: { id: "user-1" },
    permissionKey: PERMISSIONS.INFRA_PROXMOX_READ,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "permission_granted");
  assert.deepEqual(decision.roles, ["Operator"]);
});

test("evaluate grants access when wildcard permission exists", async () => {
  const service = new AuthorizationService({
    rbacRepository: {
      listRoleKeysForUser: async () => ["Administrator"],
      listPermissionKeysForUser: async () => [PERMISSIONS.ALL],
    },
  });

  const decision = await service.evaluate({
    user: { id: "user-1" },
    permissionKey: PERMISSIONS.ADMIN_SETTINGS_READ,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "permission_granted");
});

test("evaluate denies access when permission is missing", async () => {
  const service = new AuthorizationService({
    rbacRepository: {
      listRoleKeysForUser: async () => ["Viewer"],
      listPermissionKeysForUser: async () => [PERMISSIONS.SYSTEM_AUTHENTICATED],
    },
  });

  const decision = await service.evaluate({
    user: { id: "user-1" },
    permissionKey: PERMISSIONS.INFRA_PROXMOX_ACTION,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "permission_missing");
});
