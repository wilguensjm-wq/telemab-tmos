export class RbacRepository {
  constructor({ db }) {
    this.db = db;
  }

  async syncCatalog({ roles, permissions, rolePermissions }) {
    await this.db.withTransaction(async (tx) => {
      for (const role of roles) {
        await tx.query(
          `INSERT INTO roles(role_key, description)
           VALUES ($1, $2)
           ON CONFLICT(role_key)
           DO UPDATE SET description = EXCLUDED.description`,
          [role.key, role.description],
        );
      }

      for (const permission of permissions) {
        await tx.query(
          `INSERT INTO permissions(permission_key, description)
           VALUES ($1, $2)
           ON CONFLICT(permission_key)
           DO UPDATE SET description = EXCLUDED.description`,
          [permission.key, permission.description],
        );
      }

      for (const role of roles) {
        const permissionKeys = rolePermissions[role.key] || [];
        await tx.query(`DELETE FROM role_permissions WHERE role_key = $1`, [role.key]);
        for (const permissionKey of permissionKeys) {
          await tx.query(
            `INSERT INTO role_permissions(role_key, permission_key)
             VALUES ($1, $2)
             ON CONFLICT(role_key, permission_key)
             DO NOTHING`,
            [role.key, permissionKey],
          );
        }
      }
    });
  }

  async ensureUserRole({ userId, roleKey }) {
    await this.db.query(
      `INSERT INTO user_roles(user_id, role_key)
       VALUES ($1, $2)
       ON CONFLICT(user_id, role_key)
       DO NOTHING`,
      [userId, roleKey],
    );
  }

  async setUserRoles({ userId, roleKeys = [] }) {
    await this.db.withTransaction(async (tx) => {
      await tx.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
      for (const roleKey of roleKeys) {
        await tx.query(
          `INSERT INTO user_roles(user_id, role_key)
           VALUES ($1, $2)
           ON CONFLICT(user_id, role_key)
           DO NOTHING`,
          [userId, roleKey],
        );
      }
    });
  }

  async listRoleKeysForUser(userId) {
    const result = await this.db.query(
      `SELECT DISTINCT role_key
       FROM (
         SELECT ur.role_key AS role_key
         FROM user_roles ur
         WHERE ur.user_id = $1
         UNION
         SELECT u.role_name AS role_key
         FROM users u
         WHERE u.id = $1
           AND u.role_name IS NOT NULL
       ) resolved_roles
       ORDER BY role_key ASC`,
      [userId],
    );

    return result.rows.map((row) => row.role_key);
  }

  async listPermissionKeysForUser(userId) {
    const result = await this.db.query(
      `SELECT DISTINCT rp.permission_key
       FROM role_permissions rp
       INNER JOIN (
         SELECT ur.role_key AS role_key
         FROM user_roles ur
         WHERE ur.user_id = $1
         UNION
         SELECT u.role_name AS role_key
         FROM users u
         WHERE u.id = $1
           AND u.role_name IS NOT NULL
       ) effective_roles
         ON effective_roles.role_key = rp.role_key
       ORDER BY rp.permission_key ASC`,
      [userId],
    );

    return result.rows.map((row) => row.permission_key);
  }
}
