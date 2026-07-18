export class EventRepository {
  constructor({ db }) {
    this.db = db;
  }

  async insert(event) {
    await this.db.query(
      `INSERT INTO events(id, timestamp, provider, resource, action, severity, status, operator, correlation_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        event.id,
        event.timestamp,
        event.provider,
        event.resource,
        event.action,
        event.severity,
        event.status,
        event.operator,
        event.correlationId,
        JSON.stringify(event.metadata || {}),
      ],
    );
    return event;
  }

  async list(limit = 300) {
    const result = await this.db.query(
      `SELECT id, timestamp, provider, resource, action, severity, status, operator, correlation_id, metadata
       FROM events
       ORDER BY timestamp DESC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp.toISOString(),
      provider: row.provider,
      resource: row.resource,
      action: row.action,
      severity: row.severity,
      status: row.status,
      operator: row.operator,
      correlationId: row.correlation_id,
      metadata: row.metadata || {},
    }));
  }
}
