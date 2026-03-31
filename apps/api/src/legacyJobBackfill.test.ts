import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { SqliteAppRepository } from "./repository.js";
import {
  auditLegacyJobDrawingLinks,
  backfillLegacyJobDrawingLinks,
} from "./repository/legacyJobBackfill.js";
import { migrateSqliteDatabase } from "./repository/sqliteSchema.js";

const emptyLayout = JSON.stringify({
  segments: [],
  gates: [],
  basketballPosts: [],
  floodlightColumns: [],
  goalUnits: [],
  kickboards: [],
  pitchDividers: [],
  sideNettings: [],
});

const emptyEstimate = JSON.stringify({
  posts: {
    terminal: 0,
    intermediate: 0,
    total: 0,
    cornerPosts: 0,
    byHeightAndType: {},
    byHeightMm: {},
  },
  corners: {
    total: 0,
    internal: 0,
    external: 0,
    unclassified: 0,
  },
  materials: {
    twinBarPanels: 0,
    twinBarPanelsSuperRebound: 0,
    twinBarPanelsByStockHeightMm: {},
    twinBarPanelsByFenceHeight: {},
    roll2100: 0,
    roll900: 0,
    totalRolls: 0,
    rollsByFenceHeight: {},
  },
  optimization: {
    strategy: "CHAINED_CUT_PLANNER",
    twinBar: {
      reuseAllowanceMm: 200,
      stockPanelWidthMm: 2525,
      fixedFullPanels: 0,
      baselinePanels: 0,
      optimizedPanels: 0,
      panelsSaved: 0,
      totalCutDemands: 0,
      stockPanelsOpened: 0,
      reusedCuts: 0,
      totalConsumedMm: 0,
      totalLeftoverMm: 0,
      reusableLeftoverMm: 0,
      utilizationRate: 0,
      buckets: [],
    },
  },
  segments: [],
});

function createDatabase() {
  const database = new Database(join(tmpdir(), `fence-estimator-legacy-job-links-${randomUUID()}.db`));
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  migrateSqliteDatabase(database);
  return database;
}

function createDatabasePath() {
  return join(tmpdir(), `fence-estimator-legacy-job-links-${randomUUID()}.db`);
}

function seedCompany(database: Database.Database) {
  database.prepare("INSERT INTO companies (id, name, created_at_iso) VALUES (?, ?, ?)").run(
    "company-1",
    "Acme Fencing",
    "2026-03-10T10:00:00.000Z",
  );
  database
    .prepare(
      `
        INSERT INTO users (
          id,
          company_id,
          email,
          display_name,
          role,
          password_hash,
          password_salt,
          created_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "user-1",
      "company-1",
      "owner@example.com",
      "Owner",
      "OWNER",
      "hash",
      "salt",
      "2026-03-10T10:00:00.000Z",
    );
  database
    .prepare(
      `
        INSERT INTO customers (
          id,
          company_id,
          name,
          name_normalized,
          primary_contact_name,
          primary_email,
          primary_phone,
          additional_contacts_json,
          site_address,
          notes,
          is_archived,
          created_by_user_id,
          updated_by_user_id,
          created_at_iso,
          updated_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "customer-1",
      "company-1",
      "Cleveland Land Services",
      "cleveland land services",
      "",
      "",
      "",
      "[]",
      "",
      "",
      0,
      "user-1",
      "user-1",
      "2026-03-10T10:00:00.000Z",
      "2026-03-10T10:00:00.000Z",
    );
}

function insertLegacyDrawing(
  database: Database.Database,
  input: {
    id: string;
    name: string;
    customerId: string | null;
    customerName: string;
    parentDrawingId: string | null;
    revisionNumber: number;
    jobId?: string | null;
    jobRole?: "PRIMARY" | "SECONDARY" | null;
  },
) {
  database
    .prepare(
      `
        INSERT INTO drawings (
          id,
          company_id,
          name,
          customer_id,
          customer_name,
          layout_json,
          estimate_json,
          schema_version,
          rules_version,
          version_number,
          is_archived,
          archived_at_iso,
          archived_by_user_id,
          status,
          status_changed_at_iso,
          status_changed_by_user_id,
          created_by_user_id,
          updated_by_user_id,
          created_at_iso,
          updated_at_iso,
          job_id,
          job_role,
          parent_drawing_id,
          revision_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.id,
      "company-1",
      input.name,
      input.customerId,
      input.customerName,
      emptyLayout,
      emptyEstimate,
      1,
      "2026-03-11",
      1,
      0,
      null,
      null,
      "DRAFT",
      null,
      null,
      "user-1",
      "user-1",
      "2026-03-10T10:00:00.000Z",
      "2026-03-10T10:00:00.000Z",
      input.jobId ?? null,
      input.jobRole ?? null,
      input.parentDrawingId,
      input.revisionNumber,
    );
}

function insertJob(
  database: Database.Database,
  input: { id: string; customerId: string; name: string; primaryDrawingId: string | null },
) {
  database
    .prepare(
      `
        INSERT INTO jobs (
          id,
          company_id,
          customer_id,
          customer_name,
          name,
          stage,
          primary_drawing_id,
          commercial_inputs_json,
          notes,
          owner_user_id,
          is_archived,
          archived_at_iso,
          archived_by_user_id,
          stage_changed_at_iso,
          stage_changed_by_user_id,
          created_by_user_id,
          updated_by_user_id,
          created_at_iso,
          updated_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.id,
      "company-1",
      input.customerId,
      "Cleveland Land Services",
      input.name,
      "DRAFT",
      input.primaryDrawingId,
      "{}",
      "",
      "user-1",
      0,
      null,
      null,
      null,
      null,
      "user-1",
      "user-1",
      "2026-03-10T10:00:00.000Z",
      "2026-03-10T10:00:00.000Z",
    );
}

describe("legacy job drawing backfill", () => {
  it("groups a root drawing chain into one migrated job workspace", () => {
    const database = createDatabase();
    seedCompany(database);
    insertLegacyDrawing(database, {
      id: "drawing-root",
      name: "North perimeter",
      customerId: "customer-1",
      customerName: "Cleveland Land Services",
      parentDrawingId: null,
      revisionNumber: 0,
    });
    insertLegacyDrawing(database, {
      id: "drawing-rev-1",
      name: "North perimeter",
      customerId: "customer-1",
      customerName: "Cleveland Land Services",
      parentDrawingId: "drawing-root",
      revisionNumber: 1,
    });

    const before = auditLegacyJobDrawingLinks(database);
    expect(before.drawingsMissingCustomer).toHaveLength(0);
    expect(before.drawingsMissingJob).toHaveLength(2);
    expect(before.backfillableChainCount).toBe(1);

    const result = backfillLegacyJobDrawingLinks(database);

    expect(result.createdJobs).toBe(1);
    expect(result.updatedDrawings).toBe(2);
    expect(result.blockedDrawingIds).toEqual([]);

    const drawings = database
      .prepare(
        "SELECT id, job_id, job_role, parent_drawing_id FROM drawings ORDER BY created_at_iso ASC, id ASC",
      )
      .all() as Array<{
      id: string;
      job_id: string | null;
      job_role: string | null;
      parent_drawing_id: string | null;
    }>;
    expect(drawings).toEqual([
      {
        id: "drawing-rev-1",
        job_id: "legacy-job:drawing-root",
        job_role: "SECONDARY",
        parent_drawing_id: "drawing-root",
      },
      {
        id: "drawing-root",
        job_id: "legacy-job:drawing-root",
        job_role: "PRIMARY",
        parent_drawing_id: null,
      },
    ]);

    const jobs = database
      .prepare("SELECT id, customer_id, name, primary_drawing_id FROM jobs")
      .all() as Array<{
      id: string;
      customer_id: string;
      name: string;
      primary_drawing_id: string | null;
    }>;
    expect(jobs).toEqual([
      {
        id: "legacy-job:drawing-root",
        customer_id: "customer-1",
        name: "North perimeter",
        primary_drawing_id: "drawing-root",
      },
    ]);

    const after = auditLegacyJobDrawingLinks(database);
    expect(after.drawingsMissingJob).toHaveLength(0);
    expect(after.backfillableChainCount).toBe(0);

    database.close();
  });

  it("surfaces customer-less drawings as blockers instead of inventing jobs", () => {
    const database = createDatabase();
    seedCompany(database);
    insertLegacyDrawing(database, {
      id: "drawing-orphan",
      name: "Orphan legacy drawing",
      customerId: null,
      customerName: "",
      parentDrawingId: null,
      revisionNumber: 0,
    });

    const before = auditLegacyJobDrawingLinks(database);
    expect(before.drawingsMissingCustomer).toHaveLength(1);
    expect(before.backfillableChainCount).toBe(0);

    const result = backfillLegacyJobDrawingLinks(database);
    expect(result.createdJobs).toBe(0);
    expect(result.updatedDrawings).toBe(0);
    expect(result.blockedDrawingIds).toEqual(["drawing-orphan"]);

    const jobs = database.prepare("SELECT COUNT(*) AS total FROM jobs").get() as { total: number };
    expect(jobs.total).toBe(0);

    database.close();
  });

  it("fails fast when one drawing chain is linked to multiple real jobs", () => {
    const databasePath = createDatabasePath();
    const database = new Database(databasePath);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    migrateSqliteDatabase(database);
    seedCompany(database);
    insertJob(database, {
      id: "job-1",
      customerId: "customer-1",
      name: "North perimeter",
      primaryDrawingId: "drawing-root",
    });
    insertJob(database, {
      id: "job-2",
      customerId: "customer-1",
      name: "North perimeter rev",
      primaryDrawingId: "drawing-rev-1",
    });
    insertLegacyDrawing(database, {
      id: "drawing-root",
      name: "North perimeter",
      customerId: "customer-1",
      customerName: "Cleveland Land Services",
      parentDrawingId: null,
      revisionNumber: 0,
      jobId: "job-1",
      jobRole: "PRIMARY",
    });
    insertLegacyDrawing(database, {
      id: "drawing-rev-1",
      name: "North perimeter",
      customerId: "customer-1",
      customerName: "Cleveland Land Services",
      parentDrawingId: "drawing-root",
      revisionNumber: 1,
      jobId: "job-2",
      jobRole: "SECONDARY",
    });
    database.close();

    expect(() => new SqliteAppRepository(databasePath)).toThrow(
      /Legacy workspace cleanup required before startup/,
    );
  });
});
