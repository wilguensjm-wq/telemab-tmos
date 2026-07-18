import { config } from "../config/index.js";
import { logger } from "../logging/logger.js";
import { DatabaseClient } from "./client.js";
import { runMigrations } from "./migrationRunner.js";

async function main() {
  if (!config.database.url) {
    throw new Error("TMOS_DATABASE_URL is required to run migrations");
  }

  const db = new DatabaseClient({
    connectionString: config.database.url,
    ssl: config.database.ssl,
    max: config.database.maxPoolSize,
    idleTimeoutMs: config.database.idleTimeoutMs,
  });

  try {
    await runMigrations({ db, logger });
    logger.info("db.migration.complete", { status: "ok" });
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  logger.error("db.migration.failed", {
    message: error?.message || "Unknown migration error",
  });
  process.exit(1);
});
