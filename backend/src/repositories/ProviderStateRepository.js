export class ProviderStateRepository {
  constructor({ db }) {
    this.db = db;
  }

  async upsert({ providerKey, status, payload = {}, correlationId = null }) {
    await this.db.query(
      `INSERT INTO provider_state(provider_key, status, payload, correlation_id)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT(provider_key)
       DO UPDATE SET
         status = EXCLUDED.status,
         payload = EXCLUDED.payload,
         correlation_id = EXCLUDED.correlation_id,
         updated_at = NOW()`,
      [providerKey, status, JSON.stringify(payload), correlationId],
    );
  }

  async list() {
    const result = await this.db.query(
      `SELECT provider_key, status, payload, correlation_id, updated_at
       FROM provider_state
       ORDER BY provider_key ASC`,
    );

    return result.rows.map((row) => ({
      providerKey: row.provider_key,
      status: row.status,
      payload: row.payload || {},
      correlationId: row.correlation_id,
      updatedAt: row.updated_at.toISOString(),
    }));
  }
}
