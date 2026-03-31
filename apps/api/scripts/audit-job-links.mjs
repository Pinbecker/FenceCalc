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

function printIssueList(title, items, formatter) {
  if (items.length === 0) {
    return;
  }
  console.log(`\n${title}:`);
  for (const item of items) {
    console.log(`  - ${formatter(item)}`);
  }
}

const { databasePath: argPath } = parseArgs(process.argv.slice(2));
const databasePath = argPath ?? process.env.DATABASE_PATH ?? "./data/fence-estimator.db";
const resolvedPath = resolve(databasePath);

console.log(`Auditing job-centric drawing links: ${resolvedPath}`);

const database = new Database(resolvedPath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

const { auditLegacyJobDrawingLinks } = await import("../dist/repository/legacyJobBackfill.js");

const audit = auditLegacyJobDrawingLinks(database);

console.log(`\nSummary`);
console.log(`  Drawings scanned: ${audit.totalDrawings}`);
console.log(`  Drawings missing customer: ${audit.drawingsMissingCustomer.length}`);
console.log(`  Drawings missing job: ${audit.drawingsMissingJob.length}`);
console.log(`  Backfillable legacy chains: ${audit.backfillableChainCount}`);
console.log(`  Stale placeholder jobs: ${audit.stalePlaceholderJobCount}`);

printIssueList(
  "Drawings missing customer",
  audit.drawingsMissingCustomer,
  (drawing) => `${drawing.companyId} :: ${drawing.id} :: ${drawing.name}`,
);
printIssueList(
  "Drawings missing job",
  audit.drawingsMissingJob,
  (drawing) => `${drawing.companyId} :: ${drawing.id} :: ${drawing.name}`,
);
printIssueList(
  "Chains with mixed customers",
  audit.chainsWithMixedCustomers,
  (chain) =>
    `${chain.companyId} :: root ${chain.rootDrawingId} :: drawings ${chain.drawingIds.join(", ")} :: customers ${chain.customerIds.join(", ")}`,
);
printIssueList(
  "Chains with multiple real jobs",
  audit.chainsWithMultipleRealJobs,
  (chain) =>
    `${chain.companyId} :: root ${chain.rootDrawingId} :: drawings ${chain.drawingIds.join(", ")} :: jobs ${chain.jobIds.join(", ")}`,
);

database.close();

const hasBlockingIssues =
  audit.drawingsMissingCustomer.length > 0 ||
  audit.chainsWithMixedCustomers.length > 0 ||
  audit.chainsWithMultipleRealJobs.length > 0;

if (hasBlockingIssues) {
  console.error("\nManual cleanup is required before the full job-centric cutover can be considered complete.");
  process.exitCode = 1;
} else {
  console.log("\nAudit complete. Safe backfill candidates are ready to migrate.");
}
