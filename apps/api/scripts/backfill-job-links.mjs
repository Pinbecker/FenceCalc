#!/usr/bin/env node

import { resolve } from "node:path";
import Database from "better-sqlite3";

function parseArgs(args) {
  let databasePath = null;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--database" && args[index + 1]) {
      databasePath = args[index + 1];
      index += 1;
    }
  }
  return { databasePath };
}

const { databasePath: argPath } = parseArgs(process.argv.slice(2));
const databasePath = argPath ?? process.env.DATABASE_PATH ?? "./data/fence-estimator.db";
const resolvedPath = resolve(databasePath);

console.log(`Backfilling job-centric drawing links: ${resolvedPath}`);

const database = new Database(resolvedPath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

const { migrateSqliteDatabase } = await import("../dist/repository/sqliteSchema.js");
const {
  auditLegacyJobDrawingLinks,
  backfillLegacyJobDrawingLinks,
} = await import("../dist/repository/legacyJobBackfill.js");

migrateSqliteDatabase(database);

const before = auditLegacyJobDrawingLinks(database);
const backfill = database.transaction(() => backfillLegacyJobDrawingLinks(database))();
const after = auditLegacyJobDrawingLinks(database);

console.log(`\nBackfill result`);
console.log(`  Jobs created: ${backfill.createdJobs}`);
console.log(`  Drawings relinked: ${backfill.updatedDrawings}`);
console.log(`  Quotes relinked: ${backfill.updatedQuotes}`);
console.log(`  Placeholder jobs removed: ${backfill.removedPlaceholderJobs}`);
console.log(`  Blocked drawings left for manual cleanup: ${backfill.blockedDrawingIds.length}`);

console.log(`\nPost-backfill audit`);
console.log(`  Drawings missing customer: ${after.drawingsMissingCustomer.length}`);
console.log(`  Drawings missing job: ${after.drawingsMissingJob.length}`);
console.log(`  Backfillable legacy chains remaining: ${after.backfillableChainCount}`);
console.log(`  Stale placeholder jobs remaining: ${after.stalePlaceholderJobCount}`);

database.close();

const hasBlockingIssues =
  after.drawingsMissingCustomer.length > 0 ||
  after.chainsWithMixedCustomers.length > 0 ||
  after.chainsWithMultipleRealJobs.length > 0;
const hasRemainingJobGaps = after.drawingsMissingJob.length > 0 || after.backfillableChainCount > 0;

if (before.totalDrawings === 0) {
  console.log("\nNo drawings found. Nothing needed backfilling.");
} else if (!hasBlockingIssues && !hasRemainingJobGaps) {
  console.log("\nBackfill complete. The database is aligned to the job-centric portal model.");
} else {
  console.error("\nBackfill finished with manual follow-up required.");
  process.exitCode = 1;
}
