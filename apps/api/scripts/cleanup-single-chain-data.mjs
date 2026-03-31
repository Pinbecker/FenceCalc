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

function makePlaceholders(count) {
  return Array.from({ length: count }, () => "?").join(", ");
}

function sortByRevision(left, right) {
  const leftRevision = Number(left.revision_number ?? 0);
  const rightRevision = Number(right.revision_number ?? 0);
  if (leftRevision !== rightRevision) {
    return leftRevision - rightRevision;
  }
  return String(left.created_at_iso ?? "").localeCompare(String(right.created_at_iso ?? ""));
}

const { databasePath: argPath } = parseArgs(process.argv.slice(2));
const databasePath = argPath ?? process.env.DATABASE_PATH ?? "./data/fence-estimator.db";
const resolvedPath = resolve(databasePath);

console.log(`Cleaning single-chain portal data: ${resolvedPath}`);

const database = new Database(resolvedPath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

const summary = {
  deletedCustomers: 0,
  deletedJobs: 0,
  deletedDrawings: 0,
  deletedQuotes: 0,
  clearedTaskRevisionLinks: 0,
  normalizedJobs: 0,
  promotedRoots: 0,
  deletedActiveMultiRootJobs: 0,
};

const deletedMultiRootJobs = [];

function deleteDrawings(companyId, drawingIds) {
  if (drawingIds.length === 0) {
    return;
  }
  const placeholders = makePlaceholders(drawingIds.length);
  const linkParams = [companyId, ...drawingIds];
  summary.clearedTaskRevisionLinks += database
    .prepare(
      `UPDATE job_tasks SET drawing_id = NULL WHERE company_id = ? AND drawing_id IN (${placeholders})`,
    )
    .run(...linkParams).changes;
  summary.deletedQuotes += database
    .prepare(`DELETE FROM quotes WHERE company_id = ? AND drawing_id IN (${placeholders})`)
    .run(...linkParams).changes;
  database
    .prepare(`DELETE FROM drawing_versions WHERE company_id = ? AND drawing_id IN (${placeholders})`)
    .run(...linkParams);
  summary.deletedDrawings += database
    .prepare(`DELETE FROM drawings WHERE company_id = ? AND id IN (${placeholders})`)
    .run(...linkParams).changes;
}

function deleteJob(job) {
  const drawings = database
    .prepare(
      `
      SELECT id
      FROM drawings
      WHERE company_id = ? AND job_id = ?
    `,
    )
    .all(job.company_id, job.id);
  deleteDrawings(
    job.company_id,
    drawings.map((drawing) => drawing.id),
  );
  database
    .prepare("DELETE FROM job_tasks WHERE company_id = ? AND job_id = ?")
    .run(job.company_id, job.id);
  summary.deletedQuotes += database
    .prepare("DELETE FROM quotes WHERE company_id = ? AND job_id = ?")
    .run(job.company_id, job.id).changes;
  summary.deletedJobs += database
    .prepare("DELETE FROM jobs WHERE company_id = ? AND id = ?")
    .run(job.company_id, job.id).changes;
}

function normalizeJobChain(job) {
  const drawings = database
    .prepare(
      `
      SELECT id, parent_drawing_id, revision_number, created_at_iso, updated_at_iso
      FROM drawings
      WHERE company_id = ? AND job_id = ?
    `,
    )
    .all(job.company_id, job.id);
  if (drawings.length === 0) {
    deleteJob(job);
    return;
  }

  const currentPrimaryId = database
    .prepare("SELECT primary_drawing_id FROM jobs WHERE company_id = ? AND id = ?")
    .get(job.company_id, job.id)?.primary_drawing_id;
  const ordered = [...drawings].sort(sortByRevision);
  const nextRoot =
    ordered.find((drawing) => drawing.id === currentPrimaryId) ??
    ordered.find((drawing) => !drawing.parent_drawing_id) ??
    ordered[0];
  const remaining = [nextRoot, ...ordered.filter((drawing) => drawing.id !== nextRoot.id)];

  database
    .prepare("UPDATE jobs SET primary_drawing_id = ? WHERE company_id = ? AND id = ?")
    .run(nextRoot.id, job.company_id, job.id);

  for (const [index, drawing] of remaining.entries()) {
    database
      .prepare(
        `
        UPDATE drawings
        SET parent_drawing_id = ?, revision_number = ?, job_role = ?
        WHERE company_id = ? AND id = ?
      `,
      )
      .run(
        index === 0 ? null : nextRoot.id,
        index,
        index === 0 ? "PRIMARY" : "SECONDARY",
        job.company_id,
        drawing.id,
      );
  }

  summary.normalizedJobs += 1;
  if (nextRoot.id !== currentPrimaryId) {
    summary.promotedRoots += 1;
  }
}

const runCleanup = database.transaction(() => {
  const archivedCustomers = database
    .prepare(
      `
      SELECT id, company_id, name
      FROM customers
      WHERE is_archived = 1
    `,
    )
    .all();

  for (const customer of archivedCustomers) {
    const jobs = database
      .prepare(
        `
        SELECT id, company_id, name
        FROM jobs
        WHERE company_id = ? AND customer_id = ?
      `,
      )
      .all(customer.company_id, customer.id);
    for (const job of jobs) {
      deleteJob(job);
    }

    const orphanDrawings = database
      .prepare(
        `
        SELECT id
        FROM drawings
        WHERE company_id = ? AND customer_id = ? AND (
          job_id IS NULL OR job_id NOT IN (
            SELECT id FROM jobs WHERE company_id = drawings.company_id
          )
        )
      `,
      )
      .all(customer.company_id, customer.id);
    deleteDrawings(
      customer.company_id,
      orphanDrawings.map((drawing) => drawing.id),
    );

    summary.deletedCustomers += database
      .prepare("DELETE FROM customers WHERE company_id = ? AND id = ?")
      .run(customer.company_id, customer.id).changes;
  }

  const archivedJobs = database
    .prepare(
      `
      SELECT id, company_id, name
      FROM jobs
      WHERE is_archived = 1
    `,
    )
    .all();
  for (const job of archivedJobs) {
    deleteJob(job);
  }

  const activeMultiRootJobs = database
    .prepare(
      `
      SELECT
        j.id,
        j.company_id,
        j.name,
        COUNT(d.id) AS root_count
      FROM jobs j
      JOIN drawings d
        ON d.company_id = j.company_id
       AND d.job_id = j.id
       AND d.parent_drawing_id IS NULL
      WHERE j.is_archived = 0
      GROUP BY j.company_id, j.id, j.name
      HAVING COUNT(d.id) > 1
    `,
    )
    .all();
  for (const job of activeMultiRootJobs) {
    deletedMultiRootJobs.push(`${job.company_id} :: ${job.id} :: ${job.name} (${job.root_count} roots)`);
    summary.deletedActiveMultiRootJobs += 1;
    deleteJob(job);
  }

  const activeJobs = database
    .prepare(
      `
      SELECT id, company_id, name
      FROM jobs
      WHERE is_archived = 0
    `,
    )
    .all();

  for (const job of activeJobs) {
    const drawings = database
      .prepare(
        `
        SELECT id, is_archived, parent_drawing_id, revision_number, created_at_iso
        FROM drawings
        WHERE company_id = ? AND job_id = ?
      `,
      )
      .all(job.company_id, job.id);
    if (drawings.length === 0) {
      deleteJob(job);
      continue;
    }

    const rootCount = drawings.filter((drawing) => !drawing.parent_drawing_id).length;
    if (rootCount > 1) {
      deletedMultiRootJobs.push(`${job.company_id} :: ${job.id} :: ${job.name} (${rootCount} roots)`);
      summary.deletedActiveMultiRootJobs += 1;
      deleteJob(job);
      continue;
    }

    const archivedDrawingIds = drawings
      .filter((drawing) => Number(drawing.is_archived) === 1)
      .sort(sortByRevision)
      .map((drawing) => drawing.id);
    if (archivedDrawingIds.length === 0) {
      continue;
    }

    const activeRevisionCount = drawings.filter((drawing) => Number(drawing.is_archived) !== 1).length;
    if (activeRevisionCount === 0) {
      deleteJob(job);
      continue;
    }

    deleteDrawings(job.company_id, archivedDrawingIds);
    normalizeJobChain(job);
  }

  const remainingArchivedDrawings = database
    .prepare(
      `
      SELECT company_id, id
      FROM drawings
      WHERE is_archived = 1
    `,
    )
    .all();
  const archivedDrawingIdsByCompany = new Map();
  for (const drawing of remainingArchivedDrawings) {
    const companyIds = archivedDrawingIdsByCompany.get(drawing.company_id) ?? [];
    companyIds.push(drawing.id);
    archivedDrawingIdsByCompany.set(drawing.company_id, companyIds);
  }
  for (const [companyId, drawingIds] of archivedDrawingIdsByCompany) {
    deleteDrawings(companyId, drawingIds);
  }
});

runCleanup();

database.close();

console.log("\nCleanup result");
console.log(`  Archived customers deleted: ${summary.deletedCustomers}`);
console.log(`  Archived or invalid jobs deleted: ${summary.deletedJobs}`);
console.log(`  Drawings deleted: ${summary.deletedDrawings}`);
console.log(`  Quotes deleted: ${summary.deletedQuotes}`);
console.log(`  Task revision links cleared: ${summary.clearedTaskRevisionLinks}`);
console.log(`  Jobs normalized to one chain: ${summary.normalizedJobs}`);
console.log(`  Roots promoted after cleanup: ${summary.promotedRoots}`);
console.log(`  Active multi-root jobs deleted: ${summary.deletedActiveMultiRootJobs}`);

if (deletedMultiRootJobs.length > 0) {
  console.log("\nDeleted active multi-root jobs:");
  for (const entry of deletedMultiRootJobs) {
    console.log(`  - ${entry}`);
  }
}
