import { randomUUID } from "node:crypto";

export class UserRepository {
  constructor({ db }) {
    this.db = db;
  }

  async findByUsername(username) {
    const result = await this.db.query(
      `SELECT id, username, password_hash, display_name, role_name, is_active
       FROM users
       WHERE username = $1`,
      [username],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      displayName: row.display_name,
      roleName: row.role_name,
      isActive: row.is_active,
    };
  }

  async upsertUser({ id = randomUUID(), username, passwordHash, displayName, roleName, isActive = true }) {
    const result = await this.db.query(
      `INSERT INTO users(id, username, password_hash, display_name, role_name, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(username)
       DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         display_name = EXCLUDED.display_name,
         role_name = EXCLUDED.role_name,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING id, username, password_hash, display_name, role_name, is_active`,
      [id, username, passwordHash, displayName, roleName, isActive],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      displayName: row.display_name,
      roleName: row.role_name,
      isActive: row.is_active,
    };
  }
}
