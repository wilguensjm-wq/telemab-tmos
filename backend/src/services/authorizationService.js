import { PERMISSIONS } from "../auth/permissionCatalog.js";

export class AuthorizationService {
  constructor({ rbacRepository }) {
    this.rbacRepository = rbacRepository;
  }

  async evaluate({ user, permissionKey }) {
    if (!user?.id) {
      return {
        allowed: false,
        reason: "missing_user_context",
        roles: [],
        permissions: [],
      };
    }

    if (!permissionKey) {
      return {
        allowed: false,
        reason: "missing_permission_requirement",
        roles: [],
        permissions: [],
      };
    }

    const [roles, permissions] = await Promise.all([
      this.rbacRepository.listRoleKeysForUser(user.id),
      this.rbacRepository.listPermissionKeysForUser(user.id),
    ]);

    const allowed = permissions.includes(PERMISSIONS.ALL) || permissions.includes(permissionKey);
    return {
      allowed,
      reason: allowed ? "permission_granted" : "permission_missing",
      roles,
      permissions,
    };
  }
}
