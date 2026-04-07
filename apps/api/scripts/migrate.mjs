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
const { auditLegacyJobDrawingLinks, migrateLegacyWorkspaceData } = await import(
  "../dist/repository/legacyJobBackfill.js"
);

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

const beforeLegacyAudit = auditLegacyJobDrawingLinks(database);
const normalizationResult = migrateLegacyWorkspaceData(database);
const afterLegacyAudit = auditLegacyJobDrawingLinks(database);

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

const normalizationChangeCount =
  normalizationResult.backfill.createdJobs +
  normalizationResult.backfill.updatedDrawings +
  normalizationResult.backfill.updatedQuotes +
  normalizationResult.backfill.removedPlaceholderJobs +
  normalizationResult.audit.updatedEntityTypes +
  normalizationResult.audit.updatedActions +
  normalizationResult.audit.updatedMetadata;

if (normalizationChangeCount === 0) {
  console.log("No legacy workspace normalization was needed.");
} else {
  console.log("Applied legacy workspace normalization:");
  console.log(
    `  - ${normalizationResult.backfill.createdJobs} workspaces created, ` +
      `${normalizationResult.backfill.updatedDrawings} drawings relinked, ` +
      `${normalizationResult.backfill.updatedQuotes} quotes updated, ` +
      `${normalizationResult.backfill.removedPlaceholderJobs} placeholder workspaces removed`,
  );
  console.log(
    `  - ${normalizationResult.audit.updatedEntityTypes} audit entity types, ` +
      `${normalizationResult.audit.updatedActions} audit actions, ` +
      `${normalizationResult.audit.updatedMetadata} audit metadata payloads updated`,
  );
}

if (
  afterLegacyAudit.backfillableChainCount > 0 ||
  afterLegacyAudit.drawingsMissingJob.length > 0 ||
  afterLegacyAudit.stalePlaceholderJobCount > 0
) {
  console.error("Legacy workspace normalization is still incomplete after migration.");
  process.exitCode = 1;
}

database.close();
console.log("Migration complete.");
