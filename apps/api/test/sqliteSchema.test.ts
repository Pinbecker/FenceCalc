import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { migrateSqliteDatabase, SQLITE_SCHEMA_VERSION } from "../src/repository/sqliteSchema.js";

const temporaryDirectories: string[] = [];

function temporaryDatabasePath(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), "fence-estimator-schema-"));
  temporaryDirectories.push(directory);
  return join(directory, name);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite schema lifecycle", () => {
  it("creates a fresh versioned schema without foreign-key violations", () => {
    const database = new Database(temporaryDatabasePath("fresh.db"));
    database.pragma("foreign_keys = ON");

    migrateSqliteDatabase(database);

    const version = database
      .prepare("SELECT MAX(version) AS version FROM schema_migrations")
      .get() as { version: number };
    expect(version.version).toBe(SQLITE_SCHEMA_VERSION);
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sites'").get(),
    ).toBeTruthy();
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'estimate_versions'").get(),
    ).toBeTruthy();
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'quote_versions'").get(),
    ).toBeTruthy();
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'company_configuration_versions'").get(),
    ).toBeTruthy();
    database.close();
  });

  it("migrates version 2 customers, projects, designs and pricing without data loss", () => {
    const database = new Database(temporaryDatabasePath("v2.db"));
    database.pragma("foreign_keys = ON");
    database.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL);
      INSERT INTO schema_migrations (version) VALUES (2);
      CREATE TABLE companies (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, created_at_iso TEXT NOT NULL);
      CREATE TABLE users (
        id TEXT PRIMARY KEY NOT NULL,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at_iso TEXT NOT NULL
      );
      CREATE TABLE customers (
        id TEXT PRIMARY KEY NOT NULL,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        contact_name TEXT NULL,
        contact_email TEXT NULL,
        contact_phone TEXT NULL,
        site_address TEXT NULL,
        notes TEXT NULL,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL
      );
      CREATE TABLE projects (
        id TEXT PRIMARY KEY NOT NULL,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('DRAFT', 'QUOTED', 'WON', 'LOST', 'ON_HOLD')),
        notes TEXT NULL,
        is_archived INTEGER NOT NULL DEFAULT 0,
        status_changed_at_iso TEXT NULL,
        status_changed_by_user_id TEXT NULL,
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL
      );
      CREATE TABLE drawings (
        id TEXT PRIMARY KEY NOT NULL,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        current_revision_id TEXT NULL,
        latest_revision_number INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL
      );
      CREATE TABLE drawing_revisions (
        id TEXT PRIMARY KEY NOT NULL,
        drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL,
        revision_number INTEGER NOT NULL,
        parent_revision_id TEXT NULL REFERENCES drawing_revisions(id) ON DELETE SET NULL,
        notes TEXT NULL,
        layout_json TEXT NOT NULL,
        saved_viewport_json TEXT NULL,
        estimate_json TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        rules_version TEXT NOT NULL,
        version_number INTEGER NOT NULL DEFAULT 0,
        created_by_user_id TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        created_at_iso TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        UNIQUE (drawing_id, revision_number)
      );
      CREATE TABLE pricing_config (
        company_id TEXT PRIMARY KEY NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        items_json TEXT NOT NULL,
        workbook_json TEXT NULL,
        updated_at_iso TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL
      );
      CREATE TABLE pricing_configs (
        company_id TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        updated_at_iso TEXT NOT NULL,
        updated_by_user_id TEXT NULL
      );
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY NOT NULL,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        actor_user_id TEXT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NULL,
        action TEXT NOT NULL,
        summary TEXT NOT NULL,
        metadata_json TEXT NULL,
        created_at_iso TEXT NOT NULL
      );

      INSERT INTO companies VALUES ('company-1', 'Fence Co', '2026-01-01T00:00:00.000Z');
      INSERT INTO users VALUES (
        'user-1', 'company-1', 'owner@example.com', 'Owner', 'ADMIN', 'hash', 'salt',
        '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO customers VALUES (
        'customer-1', 'company-1', 'Local Authority', 'Jane', 'jane@example.com', '01234',
        '1 Sports Lane, York', 'Priority account', 0, 'user-1', 'user-1',
        '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'
      );
      INSERT INTO projects VALUES (
        'project-with-a-long-unique-id', 'company-1', 'customer-1', 'Sports enclosure', 'DRAFT',
        'Legacy project note', 0, NULL, NULL, 'user-1', 'user-1',
        '2026-01-03T00:00:00.000Z', '2026-01-04T00:00:00.000Z'
      );
      INSERT INTO drawings VALUES (
        'drawing-1', 'company-1', 'project-with-a-long-unique-id', 'Tennis courts', 'revision-1', 1,
        0, 'user-1', 'user-1', '2026-01-03T00:00:00.000Z', '2026-01-04T00:00:00.000Z'
      );
      INSERT INTO drawing_revisions VALUES (
        'revision-1', 'drawing-1', 'company-1', 1, NULL, NULL,
        '{"segments":[],"gates":[],"basketballFeatures":[],"basketballPosts":[],"floodlightColumns":[],"goalUnits":[],"kickboards":[],"pitchDividers":[],"sideNettings":[]}',
        NULL, '{}', 1, 'legacy-rules', 0, 'user-1', 'user-1',
        '2026-01-03T00:00:00.000Z', '2026-01-04T00:00:00.000Z'
      );
      INSERT INTO pricing_config VALUES (
        'company-1', '[{"id":"item-1"}]', NULL, '2026-01-04T00:00:00.000Z', 'user-1'
      );
      INSERT INTO pricing_configs VALUES (
        'orphaned-company', '{"items":[{"id":"legacy-item"}]}',
        '2025-12-01T00:00:00.000Z', 'orphaned-user'
      );
    `);

    migrateSqliteDatabase(database);

    const project = database.prepare("SELECT * FROM projects WHERE id = ?").get(
      "project-with-a-long-unique-id",
    ) as { status: string; site_id: string; reference: string; notes: string };
    expect(project.status).toBe("ENQUIRY");
    expect(project.site_id).toBe("legacy-site-customer-1");
    expect(project.reference).toBe("P-LEGACY-PROJECTWITHALONGUNIQUEID");
    expect(project.notes).toBe("Legacy project note");
    expect(database.prepare("SELECT address_line_1 FROM sites").get()).toEqual({
      address_line_1: "1 Sports Lane, York",
    });
    expect(database.prepare("SELECT status FROM drawings WHERE id = 'drawing-1'").get()).toEqual({
      status: "WORKING",
    });
    expect(database.prepare("SELECT items_json FROM pricing_config").get()).toEqual({
      items_json: '[{"id":"item-1"}]',
    });
    expect(database.prepare("SELECT COUNT(*) AS count FROM legacy_pricing_config_archive").get()).toEqual({
      count: 1,
    });
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pricing_configs'").get(),
    ).toBeUndefined();
    expect(database.prepare("SELECT COUNT(*) AS count FROM drawing_revisions").get()).toEqual({
      count: 1,
    });
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });

  it("refuses to overwrite an unknown non-empty database", () => {
    const database = new Database(temporaryDatabasePath("unknown.db"));
    database.exec("CREATE TABLE irreplaceable_customer_data (id TEXT PRIMARY KEY, value TEXT)");
    database.prepare("INSERT INTO irreplaceable_customer_data VALUES (?, ?)").run("1", "keep me");

    expect(() => migrateSqliteDatabase(database)).toThrow(/Refusing to replace/);
    expect(database.prepare("SELECT value FROM irreplaceable_customer_data").get()).toEqual({
      value: "keep me",
    });
    database.close();
  });

  it("upgrades lifecycle version 3 with immutable commercial snapshots", () => {
    const database = new Database(temporaryDatabasePath("v3.db"));
    database.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at_iso TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES (3, '2026-08-30T00:00:00.000Z');
      CREATE TABLE estimate_versions (id TEXT PRIMARY KEY);
      CREATE TABLE quote_versions (id TEXT PRIMARY KEY);
      INSERT INTO estimate_versions (id) VALUES ('estimate-version-1');
      INSERT INTO quote_versions (id) VALUES ('quote-version-1');
    `);

    migrateSqliteDatabase(database);

    expect(database.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({
      version: 5,
    });
    expect(
      database
        .prepare("SELECT commercial_draft_json, calculation_json, calculated_at_iso FROM estimate_versions")
        .get(),
    ).toEqual({
      commercial_draft_json:
        '{"ancillaryItems":[],"manualEntries":[],"externalCornersEnabled":true}',
      calculation_json: null,
      calculated_at_iso: null,
    });
    expect(database.prepare("SELECT presentation_json FROM quote_versions").get()).toEqual({
      presentation_json:
        '{"displayMode":"SUMMARY","currencyCode":"GBP","sections":[],"netTotal":0,"vatRate":20,"vatAmount":0,"grossTotal":0}',
    });
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'company_configuration_versions'").get(),
    ).toBeTruthy();
    database.close();
  });
});
