#!/usr/bin/env node

/**
 * Explicit database migration script.
 *
 * Usage:
 *   node scripts/migrate.mjs [--database <path>]
 *
 * If --database is not provided, falls back to DATABASE_PATH env var,
 * then to the default local dev path ./data/fence-estimator.db.
 *
 * Intended to be run as a deliberate release step before starting the API
 * in production. For local development, the API still auto-migrates on startup.
 */

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

function parseArgs(args) {
  let databasePath = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--database" && args[i + 1]) {
      databasePath = args[i + 1];
      i++;
    }
  }
  return { databasePath };
}

const { databasePath: argPath } = parseArgs(process.argv.slice(2));
const databasePath = argPath ?? process.env.DATABASE_PATH ?? "./data/fence-estimator.db";
const resolvedPath = resolve(databasePath);

console.log(`Migrating database: ${resolvedPath}`);
mkdirSync(dirname(resolvedPath), { recursive: true });

const database = new Database(resolvedPath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

// Dynamic import of the compiled migration module
const { migrateSqliteDatabase } = await import("../dist/repository/sqliteSchema.js");

const beforeRows = database.prepare("SELECT name FROM schema_migrations ORDER BY id ASC").all().catch?.(() => []);
const beforeSet = new Set();
try {
  const rows = database.prepare("SELECT name FROM schema_migrations ORDER BY id ASC").all();
  for (const row of rows) {
    beforeSet.add(row.name);
  }
} catch {
  // schema_migrations table may not exist yet
}

migrateSqliteDatabase(database);

const afterRows = database.prepare("SELECT name FROM schema_migrations ORDER BY id ASC").all();
const applied = afterRows.filter((row) => !beforeSet.has(row.name));

if (applied.length === 0) {
  console.log("Database is already up to date.");
} else {
  console.log(`Applied ${applied.length} migration(s):`);
  for (const row of applied) {
    console.log(`  - ${row.name}`);
  }
}

database.close();
console.log("Migration complete.");
