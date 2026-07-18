export class DatabaseService {
  constructor({ db }) {
    this.db = db;
  }

  async health() {
    const startedAt = Date.now();
    await this.db.query("SELECT 1 as ok");
    const latencyMs = Date.now() - startedAt;
    return {
      status: "ok",
      latencyMs,
      pool: this.db.poolStats(),
    };
  }

  poolStats() {
    return this.db.poolStats();
  }
}
