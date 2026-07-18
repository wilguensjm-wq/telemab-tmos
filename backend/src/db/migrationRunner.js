import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function runMigrations({ db, logger }) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(migrationDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const alreadyApplied = await db.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
    if (alreadyApplied.rowCount > 0) {
      continue;
    }

    const sql = await readFile(path.join(migrationDir, file), "utf8");
    await db.withTransaction(async (tx) => {
      await tx.query(sql);
      await tx.query("INSERT INTO schema_migrations(version) VALUES ($1)", [version]);
    });

    logger.info("db.migration.applied", { version });
  }
}
