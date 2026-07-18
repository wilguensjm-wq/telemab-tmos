export class ConfigRepository {
  constructor({ db }) {
    this.db = db;
  }

  async upsert(configKey, value) {
    await this.db.query(
      `INSERT INTO config_entries(config_key, value_json)
       VALUES ($1, $2::jsonb)
       ON CONFLICT(config_key)
       DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
      [configKey, JSON.stringify(value)],
    );
  }

  async upsertMany(entries = []) {
    for (const entry of entries) {
      await this.upsert(entry.key, entry.value);
    }
  }

  async list() {
    const result = await this.db.query(
      `SELECT config_key, value_json, updated_at
       FROM config_entries
       ORDER BY config_key ASC`,
    );

    return result.rows.map((row) => ({
      key: row.config_key,
      value: row.value_json,
      updatedAt: row.updated_at.toISOString(),
    }));
  }
}
