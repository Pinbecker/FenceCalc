import pg from "pg";

import { migratePostgresDatabase } from "../dist/repository/postgresSchema.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL migrations");
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 10_000),
  statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 30_000),
  application_name: "fence-estimator-migrate",
});

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await migratePostgresDatabase(client);
  await client.query("COMMIT");
  process.stdout.write("PostgreSQL migrations are up to date.\n");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
