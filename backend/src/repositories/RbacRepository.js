import { logger } from "../logging/logger.js";

export class RbacRepository {
  constructor({ db }) {
    this.db = db;
  }

  async syncCatalog({ roles, permissions, rolePermissions }) {
    const syncStartedAt = Date.now();
    logger.info("rbac.sync_catalog.begin", {
      roles: roles.length,
      permissions: permissions.length,
    });

    logger.info("rbac.sync_catalog.tx.begin", {
      elapsedMs: Date.now() - syncStartedAt,
    });

    try {
      await this.db.withTransaction(async (tx) => {
        let querySequence = 0;
        const txStartedAt = Date.now();

        logger.info("rbac.sync_catalog.tx.open", {
          elapsedMs: txStartedAt - syncStartedAt,
        });

        const runQuery = async ({ stage, params, query }) => {
          querySequence += 1;
          const queryId = querySequence;

          logger.info("rbac.sync_catalog.query.begin", {
            queryId,
            queryName: stage,
            stage,
            params,
            elapsedMs: Date.now() - syncStartedAt,
          });

          const startedAt = Date.now();
          try {
            const result = await query();
            logger.info("rbac.sync_catalog.query.end", {
              queryId,
              queryName: stage,
              stage,
              durationMs: Date.now() - startedAt,
              elapsedMs: Date.now() - syncStartedAt,
              rowCount: result?.rowCount ?? null,
            });
            return result;
          } catch (error) {
            logger.error("rbac.sync_catalog.query.fail", {
              queryId,
              queryName: stage,
              stage,
              durationMs: Date.now() - startedAt,
              elapsedMs: Date.now() - syncStartedAt,
              message: error?.message || "Unknown query error",
              code: error?.code || "INTERNAL_ERROR",
              sqlState: error?.code || "INTERNAL_ERROR",
            });
            throw error;
          }
        };

        const advisoryLockResult = await runQuery({
          stage: "rbac.sync_catalog.lock.acquire.try",
          params: ["tmos.rbac.sync.catalog"],
          query: () => tx.query(
            "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired",
            ["tmos.rbac.sync.catalog"],
          ),
        });

        if (!advisoryLockResult?.rows?.[0]?.acquired) {
          logger.warn("rbac.sync_catalog.skipped.lock_busy", {
            elapsedMs: Date.now() - syncStartedAt,
            reason: "another_transaction_is_syncing_rbac_catalog",
          });
          return;
        }

        await runQuery({
          stage: "rbac.sync_catalog.lock_timeout.set_local",
          params: ["5s"],
          query: () => tx.query("SET LOCAL lock_timeout = '5s'"),
        });

        await runQuery({
          stage: "rbac.sync_catalog.idle_timeout.set_local",
          params: ["15s"],
          query: () => tx.query("SET LOCAL idle_in_transaction_session_timeout = '15s'"),
        });

        for (const role of roles) {
          await runQuery({
            stage: `role.upsert:${role.key}`,
            params: [role.key, role.description],
            query: () => tx.query(
              `INSERT INTO roles(role_key, description)
               VALUES ($1, $2)
               ON CONFLICT(role_key)
               DO UPDATE SET description = EXCLUDED.description`,
              [role.key, role.description],
            ),
          });
        }

        for (const permission of permissions) {
          await runQuery({
            stage: `permission.upsert:${permission.key}`,
            params: [permission.key, permission.description],
            query: () => tx.query(
              `INSERT INTO permissions(permission_key, description)
               VALUES ($1, $2)
               ON CONFLICT(permission_key)
               DO UPDATE SET description = EXCLUDED.description`,
              [permission.key, permission.description],
            ),
          });
        }

        for (const role of roles) {
          const permissionKeys = rolePermissions[role.key] || [];
          await runQuery({
            stage: `role_permissions.delete:${role.key}`,
            params: [role.key],
            query: () => tx.query(`DELETE FROM role_permissions WHERE role_key = $1`, [role.key]),
          });
          for (const permissionKey of permissionKeys) {
            await runQuery({
              stage: `role_permissions.insert:${role.key}:${permissionKey}`,
              params: [role.key, permissionKey],
              query: () => tx.query(
                `INSERT INTO role_permissions(role_key, permission_key)
                 VALUES ($1, $2)
                 ON CONFLICT(role_key, permission_key)
                 DO NOTHING`,
                [role.key, permissionKey],
              ),
            });
          }
        }

        logger.info("rbac.sync_catalog.tx.done", {
          elapsedMs: Date.now() - syncStartedAt,
          durationMs: Date.now() - txStartedAt,
          queryCount: querySequence,
        });
      });
    } catch (error) {
      logger.error("rbac.sync_catalog.tx.fail", {
        elapsedMs: Date.now() - syncStartedAt,
        message: error?.message || "Unknown transaction error",
        code: error?.code || "INTERNAL_ERROR",
        sqlState: error?.code || "INTERNAL_ERROR",
      });
      throw error;
    }

    logger.info("rbac.sync_catalog.end", {
      elapsedMs: Date.now() - syncStartedAt,
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
