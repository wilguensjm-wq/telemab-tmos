export class AuditRepository {
  constructor({ db }) {
    this.db = db;
  }

  async insert(entry) {
    await this.db.query(
      `INSERT INTO audit_logs(id, timestamp, actor, action, target, result, provider, correlation_id, network_path, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        entry.id,
        entry.timestamp,
        entry.actor,
        entry.action,
        entry.target,
        entry.result,
        entry.provider,
        entry.correlationId,
        entry.networkPath,
        JSON.stringify(entry.metadata || {}),
      ],
    );
    return entry;
  }

  async list(limit = 200) {
    const result = await this.db.query(
      `SELECT id, timestamp, actor, action, target, result, provider, correlation_id, network_path, metadata
       FROM audit_logs
       ORDER BY timestamp DESC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp.toISOString(),
      actor: row.actor,
      action: row.action,
      target: row.target,
      result: row.result,
      provider: row.provider,
      correlationId: row.correlation_id,
      networkPath: row.network_path,
      metadata: row.metadata || {},
    }));
  }
}
