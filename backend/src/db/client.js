import { Pool } from "pg";

export class DatabaseClient {
  constructor({
    connectionString,
    ssl = false,
    max = 10,
    idleTimeoutMs = 30000,
    connectionTimeoutMs = 10000,
    queryTimeoutMs = 15000,
    onError = null,
  }) {
    this.pool = new Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: false } : false,
      max,
      idleTimeoutMillis: idleTimeoutMs,
      connectionTimeoutMillis: connectionTimeoutMs,
      query_timeout: queryTimeoutMs,
    });

    this.pool.on("error", (error) => {
      if (typeof onError === "function") {
        onError(error);
      }
    });
  }

  async query(text, params = []) {
    try {
      return await this.pool.query(text, params);
    } catch (error) {
      error.tmosSource = "database";
      throw error;
    }
  }

  async withTransaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      error.tmosSource = "database";
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }

  poolStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}
