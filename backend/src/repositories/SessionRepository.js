export class SessionRepository {
  constructor({ db }) {
    this.db = db;
  }

  async create({ id, userId, refreshTokenHash, expiresAt }) {
    await this.db.query(
      `INSERT INTO sessions(id, user_id, refresh_token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [id, userId, refreshTokenHash, expiresAt],
    );
  }

  async findById(id) {
    const result = await this.db.query(
      `SELECT id, user_id, refresh_token_hash, expires_at, revoked_at
       FROM sessions
       WHERE id = $1`,
      [id],
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      refreshTokenHash: row.refresh_token_hash,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }

  async revoke(id) {
    await this.db.query(
      `UPDATE sessions
       SET revoked_at = NOW()
       WHERE id = $1`,
      [id],
    );
  }

  async delete(id) {
    await this.db.query("DELETE FROM sessions WHERE id = $1", [id]);
  }

  async pruneExpired() {
    await this.db.query(
      `DELETE FROM sessions
       WHERE expires_at < NOW() OR revoked_at IS NOT NULL`,
    );
  }

  async listByUserId(userId, limit = 20) {
    const result = await this.db.query(
      `SELECT id, created_at, expires_at, revoked_at
       FROM sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
      state: row.revoked_at ? "revoked" : "active",
    }));
  }
}
